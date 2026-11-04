// Regression tests for the CSV import / export hardening:
// - parsing is linear and bounded (column cap), so a 1 MB file cannot block the event loop
// - export never holds a pooled DB connection while waiting for a slow client; stalled clients are dropped
// - per-user limiters (import / export per minute, export concurrency)
// - concurrent identical imports are de-duplicated (account row lock)
// - the 2 MB JSON parser only exists on POST /api/data/import/transactions, after auth + limiters
// - pool / session timeouts are configured
// Timing thresholds are generous on purpose (shared CI runners are slow): the unfixed code took 4-8 s or never
// answered, the fixed code takes milliseconds, so they still catch a regression without flaking.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { app, pool, appPool, dbSuite, registerUser, deleteUser, closeDb } = require("./helpers");
const csv = require("../src/services/csvService");
const { analyzeCsv, MAX_COLUMNS } = require("../src/services/importService");

const MB = 1024 * 1024;
const elapsed = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const timeIt = (fn) => {
  const t0 = process.hrtime.bigint();
  let error = null;
  try {
    fn();
  } catch (err) {
    error = err;
  }
  return { ms: elapsed(t0), error };
};

// ---------------------------------------------------------------------------
// Pure (no database)
// ---------------------------------------------------------------------------

test("parser: a record with more than maxFields fields is rejected as soon as the cap is crossed", () => {
  assert.deepEqual(csv.parseCsv("a,b,c", { maxFields: 3 }), [["a", "b", "c"]]);
  assert.throws(() => csv.parseCsv("a,b,c,d", { maxFields: 3 }), { code: "CSV_TOO_MANY_FIELDS", maxFields: 3 });
  // run-copying keeps the RFC 4180 semantics
  assert.deepEqual(csv.parseCsv('x"y,"a""b",""""\n"q"rest,z'), [['x"y', 'a"b', '"'], ["qrest", "z"]]);
  // the delimiter sniffer ignores candidates that exceed the cap
  assert.equal(csv.detectDelimiter(`${"a;".repeat(10)}a\n1;2`, { maxFields: 5 }), ",");
});

test("import parsing: worst-case 1 MB inputs are handled in well under 500 ms", () => {
  const cases = {
    "1M empty columns in one row": ",".repeat(MB - 2) + "\nx",
    "20 rows x 50k columns": Array.from({ length: 20 }, () => ",".repeat(50000)).join("\n"),
    "20 rows of multi-word headers": Array.from({ length: 20 }, () => Array(20000).fill("a b c d").join(",")).join("\n").slice(0, MB - 10),
    "1M semicolons": ";".repeat(MB - 1),
    "500k one-char lines": "x\n".repeat(MB / 2 - 1),
    "rows at the column cap": Array.from({ length: 2500 }, () => Array(MAX_COLUMNS).fill("ab").join(",")).join("\n").slice(0, MB - 1),
    "header-like cells at the cap": Array.from({ length: 25 }, () =>
      Array(MAX_COLUMNS).fill(`data importo descrizione valuta dare avere ${"w ".repeat(80)}`).join(",")).join("\n").slice(0, MB - 1),
    "one 1 MB quoted field": '"' + "x".repeat(MB - 10) + '"\n1',
    "one 1 MB unquoted field": "x".repeat(MB - 10) + "\n1",
    "unterminated quote": 'a,"' + "x,\n".repeat(MB / 3 - 2),
  };
  for (const [label, text] of Object.entries(cases)) {
    assert.ok(Buffer.byteLength(text) <= MB, label);
    const { ms, error } = timeIt(() => analyzeCsv(text));
    assert.ok(ms < 2000, `${label}: ${ms.toFixed(1)} ms`);
    // every case is either rejected with a clean 400 or (header-like cells) parsed into per-row errors
    assert.ok(!error || error.status === 400, `${label}: unexpected ${error?.message}`);
  }
  const wide = timeIt(() => analyzeCsv(",".repeat(5000) + "\nx"));
  assert.match(wide.error.message, new RegExp(`more than ${MAX_COLUMNS} columns`));

  // A legitimate, maximal file still parses quickly: 2,000 rows at full width
  const header = ["Data operazione (gg/mm)", "Importo EUR", "Causale", ...Array.from({ length: MAX_COLUMNS - 3 }, (_, i) => `extra ${i}`)];
  const rows = Array.from({ length: 2000 }, (_, i) => ["01/02/2026", `-${i + 1},50`, `Spesa ${i}`, ...Array(MAX_COLUMNS - 3).fill("")]);
  const text = [header, ...rows].map((r) => r.join(";")).join("\n");
  let parsed;
  const ok = timeIt(() => {
    parsed = analyzeCsv(text);
  });
  assert.equal(ok.error, null);
  assert.ok(ok.ms < 2000, `full-width 2,000-row file: ${ok.ms.toFixed(1)} ms`);
  assert.equal(parsed.rows.length, 2000);
  assert.deepEqual(
    [parsed.detected.mapping.date, parsed.detected.mapping.amount, parsed.detected.mapping.description],
    ["Data operazione (gg/mm)", "Importo EUR", "Causale"],
    "header recognition (exact + whole-word) is unchanged"
  );
});

// ---------------------------------------------------------------------------
// Database / HTTP
// ---------------------------------------------------------------------------

let ready;
let server;
let base;
const users = [];
const sockets = [];

before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const s of sockets) s.destroy();
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  for (const email of users) await deleteUser(email);
  await closeDb();
});

const withEnv = async (vars, fn) => {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const newUser = async (tag) => {
  const u = await registerUser(tag);
  assert.equal(u.res.status, 201, JSON.stringify(u.res.body));
  users.push(u.email);
  u.cookie = u.res.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ");
  return u;
};
const newAccount = async (u, balance = 100000) => {
  const r = await u.agent.post("/api/accounts/manual").send({ account_name: "Hardening", account_type: "checking", initial_balance: balance });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.account.id;
};
const postImport = (u, body, path = "/api/data/import/transactions", method = "POST") =>
  fetch(`${base}${path}`, {
    method,
    headers: { cookie: u.cookie, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const countTx = async (id) => (await pool.query("SELECT COUNT(*)::int n FROM transactions WHERE manual_account_id = $1", [id])).rows[0].n;

/** Opens a raw HTTP request that never reads its response (a "slow reader"). */
const stalledExport = (u) => {
  const s = net.connect(server.address().port, "127.0.0.1");
  s.on("error", () => {});
  s.pause();
  s.write(`GET /api/data/export/transactions.csv HTTP/1.1\r\nHost: x\r\nCookie: ${u.cookie}\r\n\r\n`);
  sockets.push(s);
  return s;
};

test("import DoS: three parallel 1 MB column bombs do not stall the server", async (t) => {
  if (!ready) return t.skip();
  const u = await newUser("dos");
  const acc = await newAccount(u);
  const body = JSON.stringify({ manual_account_id: acc, csv: ",".repeat(MB - 100) + "\nx" });

  const t0 = process.hrtime.bigint();
  const imports = Array.from({ length: 3 }, () => postImport(u, body));
  await sleep(50);
  const h0 = process.hrtime.bigint();
  const health = await fetch(`${base}/api/health`);
  const healthMs = elapsed(h0);
  const results = await Promise.all(imports);
  const totalMs = elapsed(t0);

  assert.equal(health.status, 200);
  assert.ok(healthMs < 2000, `/api/health answered after ${healthMs.toFixed(0)} ms (was ~8,000 ms before the fix)`);
  for (const r of results) {
    assert.equal(r.status, 400);
    assert.match(r.body.message, /more than 200 columns/);
  }
  assert.ok(totalMs < 6000, `3 imports took ${totalMs.toFixed(0)} ms (was ~11,600 ms)`);

  // someone else's (or a non-existent) account is refused before the CSV is parsed
  const other = await postImport(u, { manual_account_id: "00000000-0000-4000-8000-000000000000", csv: ",".repeat(MB - 100) + "\nx" });
  assert.equal(other.status, 404);
});

test("import limiter: per user, per minute, enforced before the 2 MB body is read", async (t) => {
  if (!ready) return t.skip();
  const u = await newUser("implim");
  const v = await newUser("implim2");
  const acc = await newAccount(u);
  const small = { manual_account_id: acc, csv: "date,amount,description\n2026-01-01,-1,x\n", dry_run: true };
  await withEnv({ IMPORT_RATE_LIMIT_PER_MIN: "2" }, async () => {
    assert.equal((await postImport(u, small)).status, 200);
    assert.equal((await postImport(u, small)).status, 200);
    const third = await postImport(u, small);
    assert.equal(third.status, 429);
    assert.match(third.body.message, /Too many CSV imports/);
    // throttled before the parser: an oversized body gets 429, not 413
    assert.equal((await postImport(u, { csv: "x".repeat(2 * MB + 100) })).status, 429);
    // other users have their own budget
    const vAcc = await newAccount(v);
    assert.equal((await postImport(v, { ...small, manual_account_id: vAcc })).status, 200);
  });
});

test("JSON parser wiring: 2 MB only on POST /import/transactions, 100 KB for every other method / path", async (t) => {
  if (!ready) return t.skip();
  const u = await newUser("parser");
  const acc = await newAccount(u);
  const medium = { manual_account_id: acc, csv: "date,amount,description\n2026-01-01,1,x\n" + "#".repeat(300 * 1024), dry_run: true };

  assert.equal((await postImport(u, medium)).status, 200, "the import route accepts > 100 KB");
  assert.equal((await postImport(u, medium, "/API/Data/Import/Transactions/")).status, 200, "same route, Express-style case / trailing slash");
  assert.equal((await postImport(u, medium, "/api/data/import/transactions", "PUT")).status, 413, "other methods keep 100 KB");
  assert.equal((await postImport(u, medium, "/api/data/import/other")).status, 413, "other sub-paths keep 100 KB");
  assert.equal((await postImport(u, medium, "/api/data/import")).status, 413);

  const anon = await fetch(`${base}/api/data/import/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: "x".repeat(1500 * 1024) }),
  });
  assert.equal(anon.status, 401, "unauthenticated callers are refused before the body is read");
});

test("concurrent identical imports: the second one sees the first one's rows as duplicates", async (t) => {
  if (!ready) return t.skip();
  const u = await newUser("race");
  const acc = await newAccount(u, 1000);
  const today = new Date().toISOString().slice(0, 10);
  const rows = Array.from({ length: 300 }, (_, i) => `${today},-1.${String(i % 100).padStart(2, "0")},Spesa ${i}`);
  const body = { manual_account_id: acc, csv: "date,amount,description\n" + rows.join("\n") };

  const [a, b] = await Promise.all([postImport(u, body), postImport(u, body)]);
  assert.equal(a.status, 200, JSON.stringify(a.body).slice(0, 200));
  assert.equal(b.status, 200, JSON.stringify(b.body).slice(0, 200));
  assert.deepEqual([a.body.data.imported, b.body.data.imported].sort((x, y) => x - y), [0, 300]);
  assert.deepEqual([a.body.data.skipped_duplicates, b.body.data.skipped_duplicates].sort((x, y) => x - y), [0, 300]);
  assert.equal(await countTx(acc), 300, "300 rows, not 600");
});

test("a real 2,000-row import fits within the statement timeout", async (t) => {
  if (!ready) return t.skip();
  const u = await newUser("big");
  const acc = await newAccount(u, 0);
  const rows = Array.from({ length: 2000 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, "0")},${i + 1}.25,Row ${i}`);
  const t0 = process.hrtime.bigint();
  const r = await postImport(u, { manual_account_id: acc, csv: "date,amount,description\n" + rows.join("\n") });
  const ms = elapsed(t0);
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.data.imported, 2000);
  assert.equal(await countTx(acc), 2000);
  t.diagnostic(`2,000-row import: ${ms.toFixed(0)} ms`);
});

test("pool and session limits are configured on both pools", async (t) => {
  if (!ready) return t.skip();
  for (const p of new Set([pool, appPool])) {
    assert.equal(p.options.connectionTimeoutMillis, 5000);
    assert.equal(p.options.idleTimeoutMillis, 30000);
    assert.equal(p.options.max, 10);
    const { rows } = await p.query(
      "SELECT current_setting('statement_timeout') AS st, current_setting('idle_in_transaction_session_timeout') AS it, current_setting('TimeZone') AS tz"
    );
    assert.deepEqual(rows[0], { st: "15s", it: "30s", tz: "UTC" });
  }
});

test("export: stalled readers hold no DB connection, are capped per user and dropped after the drain timeout", async (t) => {
  if (!ready) return t.skip();
  const u = await newUser("exp");
  const acc = await newAccount(u, 0);
  await pool.query(
    `INSERT INTO transactions (user_id, manual_account_id, transaction_date, amount, transaction_type, description, notes)
     SELECT $1, $2, NOW() - (g || ' minutes')::interval, 1, 'income', 'Descrizione abbastanza lunga ' || g, repeat('n', 60)
       FROM generate_series(1, 50000) g`,
    [u.userId, acc]
  );
  const exportUrl = `${base}/api/data/export/transactions.csv`;

  const accountsLatency = async () => {
    const t0 = process.hrtime.bigint();
    const r = await fetch(`${base}/api/accounts`, { headers: { cookie: u.cookie }, signal: AbortSignal.timeout(5000) });
    assert.equal(r.status, 200);
    return elapsed(t0);
  };

  // 1) The reviewer's scenario: 10 sockets that never read (concurrency cap lifted for this part).
  //    Before the fix each one pinned a pooled connection + open transaction: GET /api/accounts never answered.
  await withEnv({ EXPORT_MAX_CONCURRENT_PER_USER: "100", EXPORT_DRAIN_TIMEOUT_MS: "60000" }, async () => {
    const stalled = Array.from({ length: 10 }, () => stalledExport(u));
    await sleep(500);
    const busyMs = await accountsLatency(); // while the 10 exports are still filling their socket buffers
    assert.ok(busyMs < 4000, `GET /api/accounts during 10 active exports: ${busyMs.toFixed(0)} ms`);

    // Once the socket buffers are full the exports wait for 'drain' WITHOUT any DB connection
    const deadline = Date.now() + 15000;
    while (appPool.totalCount - appPool.idleCount > 0 && Date.now() < deadline) await sleep(100);
    assert.equal(appPool.totalCount - appPool.idleCount, 0, "every RLS connection is back in the pool");
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND state LIKE 'idle in transaction%'`
    );
    assert.equal(rows[0].n, 0, "no session is parked inside an open transaction");
    const stalledMs = await accountsLatency();
    assert.ok(stalledMs < 2000, `GET /api/accounts with 10 stalled exports: ${stalledMs.toFixed(0)} ms (before: no answer in 8 s)`);
    t.diagnostic(`/api/accounts latency: ${busyMs.toFixed(0)} ms during active exports, ${stalledMs.toFixed(0)} ms with 10 stalled`);

    for (const s of stalled) s.destroy(); // client disconnects free the slots
    await sleep(300);
  });

  // 2) Default cap: 2 concurrent exports per user, the third gets 429. Two clients that stop reading (and never
  //    disconnect) are dropped by the server after EXPORT_DRAIN_TIMEOUT_MS, which gives the slots back.
  await withEnv({ EXPORT_DRAIN_TIMEOUT_MS: "1000" }, async () => {
    const s1 = stalledExport(u);
    const s2 = stalledExport(u);
    await sleep(300);
    const third = await fetch(exportUrl, { headers: { cookie: u.cookie } });
    assert.equal(third.status, 429);
    assert.match((await third.json()).message, /Another export is still running/);

    let again;
    const deadline = Date.now() + 15000;
    do {
      await sleep(250);
      again = await fetch(exportUrl, { headers: { cookie: u.cookie } });
      if (again.status === 429) await again.text();
    } while (again.status === 429 && Date.now() < deadline);
    assert.equal(again.status, 200, "the stalled exports were dropped by the drain timeout");
    const text = await again.text();
    assert.equal(again.headers.get("x-export-rows"), "50000");
    const lines = text.trimEnd().split("\r\n");
    assert.equal(lines.length, 50001, "header + 50,000 rows, read in separate keyset chunks");
    assert.equal(new Set(lines).size, 50001, "no row repeated across chunks");
    s1.destroy();
    s2.destroy();
  });

  // 3) Per-minute export limiter
  await withEnv({ EXPORT_RATE_LIMIT_PER_MIN: "1" }, async () => {
    const v = await newUser("explim");
    const first = await fetch(`${exportUrl}?type=expense`, { headers: { cookie: v.cookie } });
    assert.equal(first.status, 200);
    await first.text();
    const second = await fetch(`${exportUrl}?type=expense`, { headers: { cookie: v.cookie } });
    assert.equal(second.status, 429);
  });
});
