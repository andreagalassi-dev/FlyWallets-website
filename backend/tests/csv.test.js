const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool, dbSuite, registerUser, cleanupTestUsers, closeDb, request, app } = require("./helpers");
const csv = require("../src/services/csvService");

// ---------------------------------------------------------------------------
// Pure unit tests (no database)
// ---------------------------------------------------------------------------

test("parser: quotes, escaped quotes, embedded delimiters and newlines", () => {
  const text = 'a,b,c\r\n1,"he said ""hi""","x,y"\r\n"multi\nline",,"cr\rin"\r\n';
  assert.deepEqual(csv.parseCsv(text), [
    ["a", "b", "c"],
    ["1", 'he said "hi"', "x,y"],
    ["multi\nline", "", "cr\rin"],
  ]);
});

test("parser: line endings, BOM, blank lines, missing final newline, other delimiters", () => {
  assert.deepEqual(csv.parseCsv("﻿a;b\n1;2\r3;4\r\n\n\n5;6", { delimiter: ";" }), [["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
  assert.deepEqual(csv.parseCsv("a\tb\n1\t2", { delimiter: "\t" }), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(csv.parseCsv(",,\n"), [["", "", ""]]);
  assert.deepEqual(csv.parseCsv('a,"b"'), [["a", "b"]]);
  assert.deepEqual(csv.parseCsv('say "x",y'), [['say "x"', "y"]], "a quote inside an unquoted field is literal");
  assert.deepEqual(csv.parseCsv('"",x'), [["", "x"]]);
  assert.deepEqual(csv.parseCsv(""), []);
});

test("parser: an unterminated quote is an error, not silent data loss", () => {
  assert.throws(() => csv.parseCsv('a,"never closed\nb,c'), { code: "CSV_UNTERMINATED_QUOTE" });
});

test("serializer + parser round trip nasty values", () => {
  const nasty = ['plain', 'with,comma', 'with "quote"', 'new\nline', 'cr\r\nlf', ' spaced ', 'semi;colon', '', 'ünï©ode 🚀'];
  for (const delimiter of [",", ";"]) {
    const line = csv.serializeRow(nasty, delimiter);
    assert.deepEqual(csv.parseCsv(line, { delimiter }), [nasty]);
  }
});

test("formula injection guard", () => {
  for (const bad of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx", '=HYPERLINK("http://evil")']) {
    assert.equal(csv.neutralizeFormula(bad), `'${bad}`);
    assert.equal(csv.restoreFormula(csv.neutralizeFormula(bad)), bad, "import undoes the apostrophe");
  }
  assert.equal(csv.neutralizeFormula("Esselunga"), "Esselunga");
  assert.equal(csv.neutralizeFormula(null), "");
  assert.equal(csv.restoreFormula("'quoted"), "'quoted", "only a guarded apostrophe is removed");
});

test("delimiter detection", () => {
  assert.equal(csv.detectDelimiter("a,b,c\n1,2,3\n"), ",");
  assert.equal(csv.detectDelimiter("a;b;c\n1;2;3\n"), ";");
  assert.equal(csv.detectDelimiter("a\tb\tc\n1\t2\t3\n"), "\t");
  assert.equal(csv.detectDelimiter('Data;Importo;Descrizione\n01/02/2026;"1,50";"a, b"\n'), ";");
});

test("amount parsing", () => {
  const ok = (raw, sep, cents) => assert.deepEqual(csv.parseAmount(raw, sep), { cents }, `${raw} (${sep})`);
  ok("1234.56", ".", 123456);
  ok("1,234.56", ".", 123456);
  ok("1.234,56", ",", 123456);
  ok("€ 1.234,56", ",", 123456);
  ok("-12,50", ",", -1250);
  ok("(12.50)", ".", -1250);
  ok("12,50-", ",", -1250);
  ok("+7", ".", 700);
  ok("EUR 5", ".", 500);
  ok("−3,10", ",", -310); // unicode minus
  ok("1'234.50", ".", 123450);
  ok("12.5", ".", 1250);
  ok("0.10", ".", 10);
  ok("12.500", ".", 1250);
  for (const bad of ["", "abc", "1.2.3", "12.345", "--5", "1e5", "€"]) {
    assert.ok(csv.parseAmount(bad, ".").error, `"${bad}" rejected`);
  }
  assert.ok(csv.parseAmount("1000000000000", ".").error, "too large");
  assert.equal(csv.detectDecimalSeparator(["1.234,56", "12,50"]), ",");
  assert.equal(csv.detectDecimalSeparator(["1,234.56", "12.50"]), ".");
  assert.equal(csv.detectDecimalSeparator(["1.234", "5.000"]), ".", "ambiguous groups of 3 fall back to dot");
  assert.equal(csv.detectDecimalSeparator(["-12,50", "100"]), ",");
});

test("date parsing and format detection", () => {
  assert.equal(csv.parseDate("2026-03-04", "iso"), "2026-03-04");
  assert.equal(csv.parseDate("2026-03-04T10:22:00Z", "iso"), "2026-03-04");
  assert.equal(csv.parseDate("04/03/2026", "dmy"), "2026-03-04");
  assert.equal(csv.parseDate("04/03/2026", "mdy"), "2026-04-03");
  assert.equal(csv.parseDate("4.3.26", "dmy"), "2026-03-04");
  assert.equal(csv.parseDate("04-03-2026 14:30", "dmy"), "2026-03-04");
  assert.equal(csv.parseDate("20260304", "iso"), "2026-03-04");
  assert.equal(csv.parseDate("31/02/2026", "dmy"), null, "impossible day");
  assert.equal(csv.parseDate("2026-13-01", "iso"), null);
  assert.equal(csv.parseDate("hello", "iso"), null);
  assert.equal(csv.detectDateFormat(["2026-01-05"]), "iso");
  assert.equal(csv.detectDateFormat(["13/01/2026", "02/02/2026"]), "dmy");
  assert.equal(csv.detectDateFormat(["01/13/2026"]), "mdy");
  assert.equal(csv.detectDateFormat(["01/02/2026"]), "dmy");
});

// ---------------------------------------------------------------------------
// HTTP / database tests
// ---------------------------------------------------------------------------

let ready;
let A;
let B;
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("csvA");
  B = await registerUser("csvB");
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const newAccount = async (user, balance = 100000, name = "CSV Test") => {
  const r = await user.agent.post("/api/accounts/manual").send({ account_name: name, account_type: "checking", initial_balance: balance });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.account.id;
};
const addTx = async (user, accountId, over = {}) => {
  const r = await user.agent.post("/api/transactions").send({
    manual_account_id: accountId,
    transaction_date: "2026-02-10",
    amount: 10,
    transaction_type: "expense",
    description: "Test",
    ...over,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.transaction;
};
const getCsv = (user, qs = "") =>
  user.agent.get(`/api/data/export/transactions.csv${qs}`).buffer(true).parse((res, cb) => {
    let data = "";
    res.setEncoding("utf8");
    res.on("data", (c) => { data += c; });
    res.on("end", () => cb(null, data));
  });
const imp = (user, body) => user.agent.post("/api/data/import/transactions").send(body);
const balanceOf = async (id) => (await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [id])).rows[0].current_balance;
const countTx = async (id) => (await pool.query("SELECT COUNT(*)::int n FROM transactions WHERE manual_account_id = $1", [id])).rows[0].n;

test("export: headers, BOM, columns, injection protection and tricky text", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 5000, "=Conto evil");
  await addTx(A, acc, { amount: 12.5, description: 'Cena, "da Mario"\nsecondo piano', notes: "=1+1", tags: ["a", "b"], transaction_date: "2026-02-11" });
  await addTx(A, acc, { amount: 1000, transaction_type: "income", description: "@SUM(A1:A9)", transaction_date: "2026-02-12" });

  const res = await getCsv(A, `?account_id=${acc}`);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /^text\/csv; charset=utf-8/);
  assert.match(res.headers["content-disposition"], /^attachment; filename="flywallets-transactions-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(res.headers["x-export-truncated"], "false");
  assert.equal(res.body.charCodeAt(0), 0xfeff, "UTF-8 BOM");

  const rows = csv.parseCsv(res.body);
  assert.deepEqual(rows[0], ["date", "account", "type", "amount", "currency", "category", "description", "notes", "tags"]);
  assert.equal(rows.length, 3, "header + the two transactions (opening balance is not a transaction)");
  const [first, second] = [rows[1], rows[2]]; // newest first
  assert.deepEqual(first.slice(0, 5), ["2026-02-12", "'=Conto evil", "income", "1000.00", "EUR"]);
  assert.equal(first[6], "'@SUM(A1:A9)");
  assert.equal(second[0], "2026-02-11");
  assert.equal(second[3], "12.50");
  assert.equal(second[6], 'Cena, "da Mario"\nsecondo piano');
  assert.equal(second[7], "'=1+1");
  assert.equal(second[8], "a|b");
});

test("export: filters, semicolon delimiter with decimal comma, validation, auth, isolation", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 5000, "Filtri");
  await addTx(A, acc, { amount: 1234.5, description: "Caffè Roma", transaction_date: "2026-03-01" });
  await addTx(A, acc, { amount: 20, description: "Stipendio marzo", transaction_type: "income", transaction_date: "2026-03-15" });
  await addTx(A, acc, { amount: 5, description: "100% bio_shop", transaction_date: "2026-04-01" });

  const semi = await getCsv(A, `?account_id=${acc}&delimiter=%3B&from_date=2026-03-01&to_date=2026-03-31`);
  assert.equal(semi.status, 200);
  const sr = csv.parseCsv(semi.body, { delimiter: ";" });
  assert.equal(sr.length, 3);
  assert.equal(sr[2][3], "1234,50", "decimal comma with ';'");

  const inc = csv.parseCsv((await getCsv(A, `?account_id=${acc}&type=income`)).body);
  assert.equal(inc.length, 2);
  const search = csv.parseCsv((await getCsv(A, `?account_id=${acc}&search=${encodeURIComponent("100%")}`)).body);
  assert.equal(search.length, 2, "LIKE wildcards are escaped");
  assert.equal(search[1][6], "100% bio_shop");

  assert.equal((await getCsv(A, "?delimiter=%7C")).status, 400);
  assert.equal((await getCsv(A, "?type=oops")).status, 400);
  assert.equal((await request(app).get("/api/data/export/transactions.csv")).status, 401);

  // user B sees none of A's rows, even when asking for A's account
  const other = await getCsv(B, `?account_id=${acc}`);
  assert.equal(other.status, 200);
  assert.equal(csv.parseCsv(other.body).length, 1, "header only");
});

test("export: hard cap of 50,000 rows, chunked keyset paging without gaps or repeats", async (t) => {
  if (!ready) return t.skip();
  const big = await registerUser("csvBig");
  const acc = await newAccount(big, 0, "Big");
  await pool.query(
    `INSERT INTO transactions (user_id, manual_account_id, transaction_date, amount, transaction_type, description)
     SELECT $1, $2, TIMESTAMP '2025-01-01' + (g % 30) * INTERVAL '1 day', 1, 'expense', 'row ' || g
       FROM generate_series(1, 50120) g`,
    [big.userId, acc]
  );
  const res = await getCsv(big);
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-export-truncated"], "true");
  assert.equal(res.headers["x-export-rows"], "50000");
  const rows = csv.parseCsv(res.body);
  assert.equal(rows.length, 50001);
  assert.equal(new Set(rows.slice(1).map((r) => r[6])).size, 50000, "no duplicated rows across chunks");
});

const ITALIAN = [
  "Data operazione;Data valuta;Descrizione;Dare;Avere",
  "05/03/2026;05/03/2026;Esselunga Milano;45,30;",
  "01/03/2026;01/03/2026;Bonifico Stipendio;;\"1.800,00\"",
  "03/03/2026;03/03/2026;\"Ricarica Iliad\";9,99;",
].join("\r\n");

test("import: Italian bank format (; dd/mm/yyyy, decimal comma, Dare/Avere), dry run first, then real", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 100, "Import IT");
  const before = await countTx(acc);

  const dry = await imp(A, { manual_account_id: acc, csv: ITALIAN, dry_run: true });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  const d = dry.body.data;
  assert.equal(d.dry_run, true);
  assert.deepEqual([d.imported, d.skipped_duplicates, d.errors.length], [3, 0, 0]);
  assert.equal(d.detected.delimiter, ";");
  assert.equal(d.detected.date_format, "dmy");
  assert.equal(d.detected.decimal_separator, ",");
  assert.equal(d.detected.mapping.date, "Data operazione");
  assert.equal(d.detected.mapping.description, "Descrizione");
  assert.equal(d.detected.mapping.debit, "Dare");
  assert.equal(d.detected.mapping.credit, "Avere");
  assert.equal(d.preview.length, 3);
  assert.equal(d.preview[0].type, "expense");
  assert.equal(d.preview[0].amount, 45.3);
  assert.equal(d.preview[1].type, "income");
  assert.equal(d.preview[1].amount, 1800);
  assert.equal(await countTx(acc), before, "dry run writes nothing");
  assert.equal(await balanceOf(acc), 100, "dry run leaves the balance alone");

  const real = await imp(A, { manual_account_id: acc, csv: ITALIAN });
  assert.equal(real.status, 200);
  const r = real.body.data;
  assert.equal(r.dry_run, false);
  assert.deepEqual([r.imported, r.skipped_duplicates, r.errors.length], [3, 0, 0]);
  assert.deepEqual(r.preview.map((p) => [p.row, p.date, p.amount, p.type, p.category]), d.preview.map((p) => [p.row, p.date, p.amount, p.type, p.category]));
  assert.equal(await balanceOf(acc), 100 + 1800 - 45.3 - 9.99);
  assert.equal(r.preview[0].category, "Cibo & Ristoranti", "keyword categorization");
  const dates = (await pool.query("SELECT transaction_date::date::text d FROM transactions WHERE manual_account_id = $1 ORDER BY d", [acc])).rows.map((x) => x.d);
  assert.deepEqual(dates, ["2026-03-01", "2026-03-03", "2026-03-05"]);

  // importing the same file again: everything is a duplicate
  const again = await imp(A, { manual_account_id: acc, csv: ITALIAN });
  assert.deepEqual([again.body.data.imported, again.body.data.skipped_duplicates], [0, 3]);
  assert.equal(await balanceOf(acc), 100 + 1800 - 45.3 - 9.99);

  const audit = await pool.query("SELECT details FROM audit_logs WHERE user_id = $1 AND action = 'import_transactions' ORDER BY created_at", [A.userId]);
  assert.ok(audit.rows.length >= 2);
  assert.deepEqual(audit.rows[0].details, { imported: 3, skipped_duplicates: 0, errors: 0 });
  assert.ok(!JSON.stringify(audit.rows).includes("Esselunga"), "audit holds counts only");
});

test("import: English format, signed amounts, symbols, duplicates inside the file are kept, bad rows reported", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 100, "Import EN");
  const text = [
    "Date,Amount,Description,Notes",
    "2026-01-10,-3.50,Coffee,morning",
    "2026-01-10,-3.50,Coffee,afternoon",
    "2026-01-11,\"€ 1,200.00\",Salary January,",
    "2026-01-12,(25.00),Phone top up,",
    "not-a-date,5,Broken date,",
    "2026-01-13,abc,Broken amount,",
    "2026-01-14,0,Zero,",
    "2026-01-15,-5,,",
    "",
    ",,,",
  ].join("\n");
  const res = await imp(A, { manual_account_id: acc, csv: text });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.data;
  assert.equal(d.imported, 4);
  assert.equal(d.skipped_duplicates, 0);
  assert.deepEqual(d.errors.map((e) => e.row), [6, 7, 8, 9]);
  assert.match(d.errors[0].message, /invalid date/);
  assert.match(d.errors[1].message, /invalid amount/);
  assert.match(d.errors[2].message, /zero/);
  assert.match(d.errors[3].message, /description/);
  assert.equal(d.detected.delimiter, ",");
  assert.equal(d.detected.date_format, "iso");
  assert.equal(d.detected.decimal_separator, ".");
  assert.equal(await balanceOf(acc), 100 + 1200 - 3.5 - 3.5 - 25);
  assert.equal(await countTx(acc), 4);
});

test("import: explicit mapping, type column, mapped category, MDY dates and tab delimiter", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Import map");
  const cats = (await A.agent.get("/api/categories")).body.data.categories;
  const bonus = cats.find((c) => c.category_name === "Bonus");
  assert.ok(bonus);
  const text = [
    "When\tHow much\tWhat\tKind\tBucket\tRemark",
    "03/25/2026\t100.00\tYear-end thing\tentrata\tbonus\t=cmd|' /C calc'!A0",
    "03/26/2026\t4.00\tSomething\tuscita\tNo Such Category\t",
    "03/27/2026\t7.00\tOops\tsideways\t\t",
  ].join("\n");
  const res = await imp(A, {
    manual_account_id: acc,
    csv: text,
    mapping: { date: "When", amount: "How much", description: "What", type: "Kind", category: "Bucket", notes: 5 },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.data;
  assert.equal(d.detected.delimiter, "\t");
  assert.equal(d.detected.date_format, "mdy");
  assert.equal(d.imported, 2);
  assert.equal(d.errors.length, 1);
  assert.match(d.errors[0].message, /unknown type/);
  const rows = (await pool.query("SELECT transaction_date::date::text d, category_id, notes, transaction_type FROM transactions WHERE manual_account_id = $1 ORDER BY d", [acc])).rows;
  assert.equal(rows[0].d, "2026-03-25");
  assert.equal(rows[0].category_id, bonus.id, "mapped category name resolved (case-insensitive)");
  assert.equal(rows[0].notes, "=cmd|' /C calc'!A0", "stored verbatim; neutralised on export");
  assert.ok(rows[1].category_id, "unknown mapped category falls back to the keyword engine");

  const bad = await imp(A, { manual_account_id: acc, csv: text, mapping: { date: "Nope" } });
  assert.equal(bad.status, 400);
  const unknown = await imp(A, { manual_account_id: acc, csv: text, mapping: { evil: "When" } });
  assert.equal(unknown.status, 400);
});

test("import: export -> import round trip is lossless (dedupe prevents doubling, new account gets everything)", async (t) => {
  if (!ready) return t.skip();
  const src = await newAccount(A, 5000, "Round src");
  await addTx(A, src, { amount: 9.99, description: '=HYPERLINK("x","y"), "quoted"', notes: "line1\nline2", tags: ["x", "y"], transaction_date: "2026-05-01" });
  await addTx(A, src, { amount: 50, transaction_type: "income", description: "+Gift", transaction_date: "2026-05-02" });
  const exported = (await getCsv(A, `?account_id=${src}`)).body;

  for (const [text, label] of [[exported, "comma"], [(await getCsv(A, `?account_id=${src}&delimiter=%3B`)).body, "semicolon"]]) {
    const dst = await newAccount(A, 5000, `Round dst ${label}`);
    const res = await imp(A, { manual_account_id: dst, csv: text });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([res.body.data.imported, res.body.data.errors.length], [2, 0], label);
    const back = (await pool.query("SELECT description, notes, tags, amount, transaction_type, transaction_date::date::text d FROM transactions WHERE manual_account_id = $1 ORDER BY d", [dst])).rows;
    assert.equal(back[0].description, '=HYPERLINK("x","y"), "quoted"');
    assert.equal(back[0].notes, "line1\nline2");
    assert.deepEqual(back[0].tags, ["x", "y"]);
    assert.equal(back[0].amount, 9.99);
    assert.equal(back[1].description, "+Gift");
    assert.equal(back[1].transaction_type, "income");
    assert.equal(await balanceOf(dst), 5000 - 9.99 + 50);
  }
  // same file into the source account: all duplicates
  const dup = await imp(A, { manual_account_id: src, csv: exported });
  assert.deepEqual([dup.body.data.imported, dup.body.data.skipped_duplicates], [0, 2]);
});

test("import: duplicate detection is per account, case-insensitive and counts multiplicities", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 1000, "Dupes");
  const other = await newAccount(A, 1000, "Dupes other");
  await addTx(A, acc, { amount: 3.5, description: "CAFFE BAR", transaction_date: "2026-06-01" });
  const text = "date,amount,description\n2026-06-01,-3.50,caffe bar\n2026-06-01,-3.50,Caffe Bar\n2026-06-01,-3.51,caffe bar\n";
  const res = await imp(A, { manual_account_id: acc, csv: text });
  assert.deepEqual([res.body.data.imported, res.body.data.skipped_duplicates], [2, 1], "one existing row absorbs one file row only");
  const otherAcc = await imp(A, { manual_account_id: other, csv: text });
  assert.deepEqual([otherAcc.body.data.imported, otherAcc.body.data.skipped_duplicates], [3, 0], "another account is independent");
});

test("import: a failing row only affects itself (savepoints), the rest commits atomically", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 1000, "Savepoints");
  await pool.query(`CREATE OR REPLACE FUNCTION csv_test_boom() RETURNS trigger AS $$
    BEGIN IF NEW.description = 'BOOM' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query("CREATE TRIGGER csv_test_boom BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION csv_test_boom()");
  try {
    const text = "date,amount,description\n2026-07-01,-10,First\n2026-07-02,-20,BOOM\n2026-07-03,-30,Third\n";
    const dry = await imp(A, { manual_account_id: acc, csv: text, dry_run: true });
    assert.deepEqual([dry.body.data.imported, dry.body.data.errors.length], [2, 1]);
    assert.equal(await balanceOf(acc), 1000);
    const res = await imp(A, { manual_account_id: acc, csv: text });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([res.body.data.imported, res.body.data.errors.length], [2, 1]);
    assert.equal(res.body.data.errors[0].row, 3);
    assert.equal(await balanceOf(acc), 1000 - 10 - 30, "balance reflects only the good rows");
    assert.equal(await countTx(acc), 2);
  } finally {
    await pool.query("DROP TRIGGER IF EXISTS csv_test_boom ON transactions");
    await pool.query("DROP FUNCTION IF EXISTS csv_test_boom()");
  }
});

test("import: ownership, auth, structure and validation errors", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 100, "Owned by A");
  const csvText = "date,amount,description\n2026-01-01,-1,x\n";
  assert.equal((await imp(B, { manual_account_id: acc, csv: csvText })).status, 404, "cannot import into someone else's account");
  assert.equal(await countTx(acc), 0);
  assert.equal((await request(app).post("/api/data/import/transactions").send({ manual_account_id: acc, csv: csvText })).status, 401);

  assert.equal((await imp(A, { csv: csvText })).status, 400, "account required");
  assert.equal((await imp(A, { manual_account_id: acc })).status, 400, "csv required");
  assert.equal((await imp(A, { manual_account_id: acc, csv: "   " })).status, 400);
  assert.equal((await imp(A, { manual_account_id: acc, csv: csvText, date_format: "xyz" })).status, 400);
  assert.equal((await imp(A, { manual_account_id: acc, csv: csvText, dry_run: "yes" })).status, 400);
  assert.equal((await imp(A, { manual_account_id: acc, csv: "just one line" })).status, 400);
  assert.equal((await imp(A, { manual_account_id: acc, csv: "foo,bar\n1,2\n" })).status, 400, "undetectable columns ask for a mapping");
  assert.equal((await imp(A, { manual_account_id: acc, csv: 'date,amount,description\n2026-01-01,1,"open' })).status, 400, "unterminated quote");
  assert.equal((await imp(A, { manual_account_id: acc, csv: "date,amount,description\n" })).status, 400, "no data rows");
  assert.equal(await countTx(acc), 0);
});

test("import limits: 2,000 rows, 1 MB csv, 2 MB body on this route only (100 KB elsewhere)", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Limits");
  const header = "date,amount,description\n";

  const rows = (n) => Array.from({ length: n }, (_, i) => `2026-01-01,${i + 1}.00,Row number ${i}`).join("\n");
  const ok = await imp(A, { manual_account_id: acc, csv: header + rows(2000), dry_run: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 300));
  assert.equal(ok.body.data.imported, 2000);
  const tooMany = await imp(A, { manual_account_id: acc, csv: header + rows(2001), dry_run: true });
  assert.equal(tooMany.status, 400);
  assert.match(JSON.stringify(tooMany.body), /2000/);

  // body above the global 100 KB limit but below 2 MB is accepted here
  const medium = header + "2026-01-01,1,x\n" + "#".repeat(300 * 1024);
  const mediumRes = await imp(A, { manual_account_id: acc, csv: medium, dry_run: true });
  assert.equal(mediumRes.status, 200, JSON.stringify(mediumRes.body).slice(0, 300));

  // csv bigger than 1 MB -> 400 (body still under 2 MB)
  const over = await imp(A, { manual_account_id: acc, csv: header + "2026-01-01,1,x\n" + "#".repeat(1024 * 1024 + 10) });
  assert.equal(over.status, 400);
  assert.match(JSON.stringify(over.body), /1 MB/);

  // body bigger than 2 MB -> 413 from the route-specific parser
  const huge = await imp(A, { manual_account_id: acc, csv: "x".repeat(2 * 1024 * 1024 + 100) });
  assert.equal(huge.status, 413);

  // everything else still rejects bodies above 100 KB
  const other = await A.agent.post("/api/transactions").send({
    manual_account_id: acc, transaction_date: "2026-01-01", amount: 1, transaction_type: "expense", description: "x".repeat(150 * 1024),
  });
  assert.equal(other.status, 413);
  const objects = await A.agent.post("/api/accounts/manual").send({ account_name: "x".repeat(150 * 1024), account_type: "cash" });
  assert.equal(objects.status, 413);

  // unauthenticated callers are refused before the body is read
  const anon = await request(app).post("/api/data/import/transactions").send({ csv: "x".repeat(1500 * 1024) });
  assert.equal(anon.status, 401);
});
