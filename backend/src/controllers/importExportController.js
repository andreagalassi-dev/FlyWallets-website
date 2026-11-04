const { pool } = require("../config/db");
const { neutralizeFormula, serializeRow } = require("../services/csvService");
const { analyzeCsv, assertImportableAccount, applyImport, buildReport } = require("../services/importService");

const EXPORT_MAX_ROWS = 50000;
const EXPORT_CHUNK = 1000;

const envInt = (name, fallback) => {
  const v = Number.parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const EXPORT_HEADER = ["date", "account", "type", "amount", "currency", "category", "description", "notes", "tags"];

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

/** Same filter semantics as GET /api/transactions. */
const buildFilter = (userId, q) => {
  const where = ["t.user_id = $1"];
  const params = [userId];
  const add = (value, clause) => {
    params.push(value);
    where.push(clause(`$${params.length}`));
  };
  if (q.account_id) add(q.account_id, (p) => `(t.manual_account_id = ${p} OR t.bank_account_id = ${p})`);
  if (q.category_id) add(q.category_id, (p) => `t.category_id = ${p}`);
  if (q.type) add(q.type, (p) => `t.transaction_type = ${p}`);
  if (q.from_date) add(q.from_date, (p) => `t.transaction_date >= ${p}::date`);
  if (q.to_date) add(q.to_date, (p) => `t.transaction_date < (${p}::date + 1)`);
  if (q.search) add(`%${escapeLike(q.search)}%`, (p) => `t.description ILIKE ${p} ESCAPE '\\'`);
  return { where, params };
};

const formatAmount = (amount, decimalComma) => {
  const s = Number(amount).toFixed(2);
  return decimalComma ? s.replace(".", ",") : s;
};

/**
 * GET /api/data/export/transactions.csv
 * Streams the user's transactions (newest first, max 50,000 rows) in keyset-paginated chunks so memory
 * stays bounded. With delimiter=";" amounts use a decimal comma (Italian Excel opens it directly).
 * Each chunk is read in its own short RLS transaction (rows inserted / deleted while the export runs may or
 * may not appear; the keyset cursor guarantees no row is sent twice). A client that stops reading is
 * disconnected after EXPORT_DRAIN_TIMEOUT_MS (default 30000) ms without draining.
 */
exports.exportTransactions = async (req, res) => {
  const delimiter = req.query.delimiter === ";" ? ";" : ",";
  const decimalComma = delimiter === ";";
  const { where, params } = buildFilter(req.user.id, req.query);

  const fetchChunk = (db, cursor) => {
    const p = [...params];
    const w = [...where];
    if (cursor) {
      p.push(cursor.d, cursor.id);
      w.push(`(t.transaction_date, t.id) < ($${p.length - 1}::timestamp, $${p.length}::uuid)`);
    }
    return db.query(
      `SELECT t.id, t.transaction_date::text AS raw_date, to_char(t.transaction_date, 'YYYY-MM-DD') AS day,
              t.amount, t.currency, t.transaction_type, t.description, t.notes, t.tags,
              c.category_name, COALESCE(m.account_name, b.account_name, b.bank_name) AS account_name
         FROM transactions t
         LEFT JOIN transaction_categories c ON c.id = t.category_id
         LEFT JOIN manual_accounts m ON m.id = t.manual_account_id
         LEFT JOIN bank_accounts b ON b.id = t.bank_account_id
        WHERE ${w.join(" AND ")}
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT ${Math.min(EXPORT_CHUNK, EXPORT_MAX_ROWS)}`,
      p
    );
  };

  // The count + first chunk run before any byte is sent, so a DB error here is still a normal JSON error
  const first = await req.withUser(async (db) => {
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM transactions t WHERE ${where.join(" AND ")}`, params)).rows[0].n;
    return { total, rows: (await fetchChunk(db, null)).rows };
  });
  const truncated = first.total > EXPORT_MAX_ROWS;

  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="flywallets-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Export-Rows", String(Math.min(first.total, EXPORT_MAX_ROWS)));
  res.setHeader("X-Export-Truncated", String(truncated));

  let closed = false;
  res.once("close", () => {
    closed = true;
  });

  /**
   * Backpressure aware write. Resolves true when the caller may continue; false when the client went away or
   * did not drain the buffer within EXPORT_DRAIN_TIMEOUT_MS (the response is then destroyed: a client that
   * stops reading cannot keep the export, and its concurrency slot, alive forever).
   */
  const drainTimeoutMs = envInt("EXPORT_DRAIN_TIMEOUT_MS", 30000);
  const write = (data) =>
    new Promise((resolve) => {
      if (closed || res.destroyed) return resolve(false);
      if (res.write(data)) return resolve(true);
      const done = (ok) => {
        clearTimeout(timer);
        res.off("drain", onDrain);
        res.off("close", onClose);
        resolve(ok);
      };
      const onDrain = () => done(true);
      const onClose = () => done(false);
      const timer = setTimeout(() => {
        done(false);
        res.destroy();
      }, drainTimeoutMs);
      res.once("drain", onDrain);
      res.once("close", onClose);
    });

  try {
    if (!(await write("﻿" + serializeRow(EXPORT_HEADER, delimiter) + "\r\n"))) return;

    let rows = first.rows;
    let sent = 0;
    while (rows.length && sent < EXPORT_MAX_ROWS) {
      const page = rows.slice(0, EXPORT_MAX_ROWS - sent);
      let buf = "";
      for (const t of page) {
        const tags = Array.isArray(t.tags) ? t.tags.join("|") : "";
        buf += serializeRow(
          [
            t.day,
            neutralizeFormula(t.account_name),
            t.transaction_type,
            formatAmount(t.amount, decimalComma),
            t.currency || "",
            neutralizeFormula(t.category_name),
            neutralizeFormula(t.description),
            neutralizeFormula(t.notes),
            neutralizeFormula(tags),
          ],
          delimiter
        ) + "\r\n";
      }
      sent += page.length;
      // No DB connection is held while waiting for the client: every chunk is read in its own short
      // transaction (keyset cursor) and the connection goes back to the pool before writing.
      if (!(await write(buf))) return;
      if (rows.length < EXPORT_CHUNK || sent >= EXPORT_MAX_ROWS) break;
      const last = rows[rows.length - 1];
      rows = (await req.withUser((db) => fetchChunk(db, { d: last.raw_date, id: last.id }))).rows;
      if (closed) return;
    }
    res.end();
  } catch (err) {
    // Headers already sent: the CSV cannot be turned into a JSON error any more, abort the connection
    if (res.headersSent) {
      console.error("CSV export failed mid-stream:", err.message);
      return res.destroy();
    }
    throw err;
  }
};

/** POST /api/data/import/transactions — parse, dedupe and apply (or simulate with dry_run). */
exports.importTransactions = async (req, res) => {
  const b = req.body;
  const dryRun = b.dry_run === true;

  // Cheap ownership / archived check first: nobody can make the server parse 1 MB for an account they cannot
  // import into. applyImport re-checks it under a row lock.
  await req.withUser((db) => assertImportableAccount(db, req.user.id, b.manual_account_id));

  const parsed = analyzeCsv(b.csv, {
    delimiter: b.delimiter,
    date_format: b.date_format,
    decimal_separator: b.decimal_separator,
    mapping: b.mapping,
  });

  await req.withUser((db) => applyImport(db, req.user.id, b.manual_account_id, parsed.rows, { dryRun }));
  const report = buildReport(parsed.rows, parsed.detected, dryRun);

  if (!dryRun) {
    // audit_logs is write-protected for the RLS role, so the owner pool records it (counts only, never content)
    await pool
      .query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
         VALUES ($1, 'import_transactions', 'manual_account', $2, $3, $4, $5)`,
        [
          req.user.id,
          b.manual_account_id,
          JSON.stringify({ imported: report.imported, skipped_duplicates: report.skipped_duplicates, errors: report.errors.length }),
          req.ip,
          (req.headers["user-agent"] || "").slice(0, 255),
        ]
      )
      .catch((err) => console.warn("import audit log failed:", err.message));
  }

  res.json({ status: "success", data: report });
};

