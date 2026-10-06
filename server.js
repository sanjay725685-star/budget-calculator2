const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const XLSX = require("xlsx");
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "budget.sqlite");

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn("Could not create data dir:", e.message);
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

let db;

function saveDb() {
  const bytes = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(bytes));
}

function columnNames() {
  return db.prepare("PRAGMA table_info(budgets)");
}

function run(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function all(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = {}) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function initDatabase(SQL) {
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'manual',
      user_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      occupation TEXT NOT NULL,
      family_members INTEGER NOT NULL,
      earning_members INTEGER NOT NULL,
      other_family_income REAL NOT NULL DEFAULT 0,
      total_income REAL NOT NULL DEFAULT 0,
      total_expenses REAL NOT NULL DEFAULT 0,
      monthly_savings REAL NOT NULL DEFAULT 0,
      savings_rate REAL NOT NULL DEFAULT 0,
      expense_ratio REAL NOT NULL DEFAULT 0,
      total_current_savings REAL NOT NULL DEFAULT 0,
      assessment TEXT NOT NULL DEFAULT '',
      income_rows TEXT NOT NULL DEFAULT '[]',
      expense_rows TEXT NOT NULL DEFAULT '[]',
      savings_rows TEXT NOT NULL DEFAULT '[]',
      yearly_budget TEXT NOT NULL DEFAULT '{}'
    )
  `);
  saveDb();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function validateBudget(body) {
  const errors = [];
  const userName = String(body.user_name || "").trim();
  const age = Number(body.age);
  const family = Number(body.family_members);
  const earning = Number(body.earning_members);

  if (!userName) errors.push("User name is required.");
  if (!Number.isInteger(age) || age < 1 || age > 120) errors.push("Age must be between 1 and 120.");
  if (!Number.isInteger(family) || family < 1) errors.push("Family members must be a positive whole number.");
  if (!Number.isInteger(earning) || earning < 1) errors.push("Earning members must be a positive whole number.");
  if (Number.isInteger(family) && Number.isInteger(earning) && earning > family) {
    errors.push("Earning members cannot exceed family members.");
  }

  return errors;
}

function classify(text) {
  const s = String(text || "").toLowerCase();
  const income = ["salary","business","freelance","freelancing","allowance","rental","rent income","interest","income"];
  const savings = ["mutual fund","mutual funds","stock","stocks","ppf","gold","fixed deposit","fd","recurring deposit","rd","saving","savings","cash"];
  const expense = ["rent","housing","food","grocery","groceries","transport","education","electricity","mobile","internet","medical","shopping","entertainment","insurance","emi","loan","expense"];

  if (savings.some(k => s.includes(k))) return "savings";
  if (expense.some(k => s.includes(k))) return "expense";
  if (income.some(k => s.includes(k))) return "income";
  return null;
}

function parseExcel(buffer, filename) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const result = { sheets: wb.SheetNames, rows: [], incomeRows: [], expenseRows: [], savingsRows: [] };

  const monthNames = {
    jan: "January", january: "January", feb: "February", february: "February",
    mar: "March", march: "March", apr: "April", april: "April",
    may: "May", jun: "June", june: "June", jul: "July", july: "July",
    aug: "August", august: "August", sep: "September", sept: "September", september: "September",
    oct: "October", october: "October", nov: "November", november: "November",
    dec: "December", december: "December"
  };

  const allParsed = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    for (const row of rows) {
      const keys = Object.keys(row);
      if (!keys.length) continue;

      const normalized = {};
      keys.forEach(k => normalized[k.toLowerCase().trim()] = row[k]);

      const findKey = (terms) => {
        const k = keys.find(key => terms.some(t => key.toLowerCase().includes(t)));
        return k ? row[k] : "";
      };

      const category = findKey(["category", "source", "head", "description", "particular"]);
      const typeRaw = findKey(["type", "income/expense", "transaction type"]);
      const amountRaw = findKey(["amount", "value", "monthly amount", "total"]);

      let monthRaw = findKey(["month"]);
      if (!monthRaw) {
        const monthKey = keys.find(k => monthNames[String(k).toLowerCase().trim()]);
        if (monthKey) monthRaw = monthNames[String(monthKey).toLowerCase().trim()];
      }

      const categoryText = String(category || "").trim();
      const typeText = String(typeRaw || "").trim().toLowerCase();
      const amount = num(String(amountRaw).replace(/[₹,\s]/g, ""));
      const rowText = `${categoryText} ${typeText}`.toLowerCase();

      if (!categoryText || !amount) continue;
      if (/total|subtotal|summary|grand total/i.test(categoryText)) continue;

      let type = null;
      if (/income/.test(typeText)) type = "income";
      else if (/expense|spend/.test(typeText)) type = "expense";
      else if (/investment|saving/.test(typeText)) type = "savings";
      else type = classify(rowText);

      if (!type) continue;

      const month = monthNames[String(monthRaw || "").toLowerCase().trim()] || String(monthRaw || "").trim() || "January";
      const item = { month, category: categoryText, amount, sourceSheet: sheetName };
      allParsed.push({ ...item, type });
      result.rows.push({ ...item, type });
      if (type === "income") result.incomeRows.push(item);
      if (type === "expense") result.expenseRows.push(item);
      if (type === "savings") result.savingsRows.push(item);
    }
  }

  return { ...result, filename, count: allParsed.length };
}

app.get("/api/budgets", (req, res) => {
  try {
    const rows = all(`
      SELECT id, created_at, entry_type, user_name, total_income, total_expenses,
             monthly_savings, savings_rate, expense_ratio, assessment
      FROM budgets ORDER BY id DESC
    `);
    res.json({ success: true, records: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not load records." });
  }
});

app.get("/api/budget/:id", (req, res) => {
  try {
    const record = one("SELECT * FROM budgets WHERE id = $id", { "$id": Number(req.params.id) });
    if (!record) return res.status(404).json({ success: false, message: "Record not found." });

    ["income_rows","expense_rows","savings_rows","yearly_budget"].forEach(k => {
      try { record[k] = JSON.parse(record[k] || (k === "yearly_budget" ? "{}" : "[]")); }
      catch { record[k] = k === "yearly_budget" ? {} : []; }
    });
    res.json({ success: true, record });
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not load the record." });
  }
});

app.post("/api/budget", (req, res) => {
  try {
    const errors = validateBudget(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(" ") });

    const b = req.body;
    const incomeRows = Array.isArray(b.income_rows) ? b.income_rows : [];
    const expenseRows = Array.isArray(b.expense_rows) ? b.expense_rows : [];
    const savingsRows = Array.isArray(b.savings_rows) ? b.savings_rows : [];
    const yearlyBudget = b.yearly_budget && typeof b.yearly_budget === "object" ? b.yearly_budget : {};

    const totalIncome = num(b.total_income);
    const totalExpenses = num(b.total_expenses);
    const savings = totalIncome - totalExpenses;
    const savingsRate = totalIncome ? (savings / totalIncome) * 100 : 0;
    const expenseRatio = totalIncome ? (totalExpenses / totalIncome) * 100 : 0;

    const stmt = db.prepare(`
      INSERT INTO budgets
      (created_at, entry_type, user_name, age, occupation, family_members, earning_members,
       other_family_income, total_income, total_expenses, monthly_savings, savings_rate,
       expense_ratio, total_current_savings, assessment, income_rows, expense_rows,
       savings_rows, yearly_budget)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      new Date().toISOString(),
      b.entry_type === "excel" ? "excel" : "manual",
      String(b.user_name).trim(),
      Number(b.age),
      String(b.occupation || ""),
      Number(b.family_members),
      Number(b.earning_members),
      num(b.other_family_income),
      totalIncome,
      totalExpenses,
      savings,
      savingsRate,
      expenseRatio,
      num(b.total_current_savings),
      String(b.assessment || ""),
      JSON.stringify(incomeRows),
      JSON.stringify(expenseRows),
      JSON.stringify(savingsRows),
      JSON.stringify(yearlyBudget)
    ]);
    stmt.free();
    saveDb();

    const id = one("SELECT last_insert_rowid() AS id").id;
    res.status(201).json({ success: true, id, message: "Budget record saved successfully." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Could not save the record." });
  }
});

app.delete("/api/budget/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = one("SELECT id FROM budgets WHERE id = $id", { "$id": id });
    if (!existing) return res.status(404).json({ success: false, message: "Record not found." });

    run("DELETE FROM budgets WHERE id = $id", { "$id": id });
    saveDb();
    res.json({ success: true, message: "Record deleted." });
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not delete the record." });
  }
});

app.post("/api/import-excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Please upload an Excel or CSV file." });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (![".xlsx", ".xls", ".csv"].includes(ext)) {
      return res.status(400).json({ success: false, message: "Only .xlsx, .xls and .csv files are supported." });
    }

    const parsed = parseExcel(req.file.buffer, req.file.originalname);
    res.json({ success: true, data: parsed });
  } catch (e) {
    console.error(e);
    res.status(400).json({ success: false, message: "Could not parse this file. Check its format and try again." });
  }
});

app.get("/api/export-excel/:id", (req, res) => {
  try {
    const record = one("SELECT * FROM budgets WHERE id = $id", { "$id": Number(req.params.id) });
    if (!record) return res.status(404).send("Record not found.");

    const incomeRows = JSON.parse(record.income_rows || "[]");
    const expenseRows = JSON.parse(record.expense_rows || "[]");
    const savingsRows = JSON.parse(record.savings_rows || "[]");
    const yearlyBudget = JSON.parse(record.yearly_budget || "{}");

    const summary = [
      ["Personal Budget Summary", ""],
      ["Name", record.user_name],
      ["Age", record.age],
      ["Occupation", record.occupation],
      ["Family Members", record.family_members],
      ["Earning Members", record.earning_members],
      ["Other Family Income", record.other_family_income],
      ["Total Income", record.total_income],
      ["Total Expenses", record.total_expenses],
      ["Monthly Savings", record.monthly_savings],
      ["Savings Rate (%)", record.savings_rate],
      ["Expense Ratio (%)", record.expense_ratio],
      ["Current Savings & Investments", record.total_current_savings],
      ["Assessment", record.assessment]
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Budget Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeRows), "Income");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), "Expenses");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(savingsRows), "Savings");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      Object.entries(yearlyBudget).map(([month, data]) => ({ month, ...data }))
    ), "Monthly Data");

    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="budget-record-${record.id}.xlsx"`);
    res.send(out);
  } catch (e) {
    console.error(e);
    res.status(500).send("Could not export the record.");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

module.exports = app;

(async () => {
  if (process.env.VERCEL) {
    console.log("Running in Vercel serverless environment");
    return;
  }
  try {
    const SQL = await initSqlJs({
      locateFile: file => path.join(__dirname, "node_modules", "sql.js", "dist", file)
    });
    initDatabase(SQL);
    app.listen(PORT, () => console.log(`Personal Budget App running at http://localhost:${PORT}`));
  } catch (err) {
    console.error("Server startup error:", err);
  }
})();
