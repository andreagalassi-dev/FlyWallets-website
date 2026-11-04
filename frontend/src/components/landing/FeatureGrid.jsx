import { formatCurrency } from "@/lib/format";
import { COLOR_TAGS } from "@/lib/colors";

// Six capabilities as tiles of different sizes, each carrying a small, true-size piece of the interface.

function Tile({ title, children, text, className = "", fragmentClassName = "" }) {
  return (
    <article className={`flex flex-col overflow-hidden bg-[#14141f] ${className}`}>
      <div className="p-6 sm:p-8">
        <h3 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-white">{title}</h3>
        <p className="mt-3 max-w-[46ch] text-[16px] leading-relaxed text-[#c4c4d4]">{text}</p>
      </div>
      <div className={`mt-auto ${fragmentClassName}`}>{children}</div>
    </article>
  );
}

const ui = "border border-primary/10 bg-[#0d0d15] text-white";

function AccountsFragment() {
  const rows = [
    { name: "Main account", type: "Checking", balance: 3912.3, color: COLOR_TAGS.gold },
    { name: "Savings fund", type: "Savings", balance: 1150, color: COLOR_TAGS.blue },
    { name: "Cash wallet", type: "Cash", balance: 178.2, color: COLOR_TAGS.green },
    { name: "Travel card", type: "Wallet", balance: 0, color: COLOR_TAGS.purple },
  ];
  return (
    <div data-ui aria-hidden="true" className={`ml-6 w-[min(560px,calc(100%-24px))] rounded-tl-xl border-b-0 border-r-0 p-5 sm:ml-8 ${ui}`}>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold">Accounts</p>
        <span className="rounded-md bg-primary px-2.5 py-1 text-[13px] font-medium text-[#0d0d15]">New account</span>
      </div>
      <ul className="mt-3">
        {rows.map((r, i) => (
          <li
            key={r.name}
            className={`flex items-center justify-between gap-3 rounded-md px-2 py-2.5 ${i === 0 ? "bg-white/[0.05]" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="truncate text-[14px]">{r.name}</span>
              <span className="hidden text-[12px] text-gray-400 sm:inline">{r.type}</span>
            </span>
            <span className="text-[14px] tabular-nums text-gray-200">{formatCurrency(r.balance)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoalsFragment() {
  const goals = [
    { name: "Summer holiday", current: 640, target: 1500, color: COLOR_TAGS.gold, by: "by 30 Jun 2027" },
    { name: "Emergency fund", current: 2100, target: 5000, color: COLOR_TAGS.blue, by: "no deadline" },
  ];
  return (
    <div data-ui aria-hidden="true" className={`mx-6 rounded-t-xl border-b-0 p-5 sm:mx-8 ${ui}`}>
      <ul className="space-y-5">
        {goals.map((g) => {
          const pct = Math.round((g.current / g.target) * 100);
          return (
            <li key={g.name}>
              <div className="flex items-center justify-between text-[14px]">
                <span className="font-medium">{g.name}</span>
                <span className="text-gray-400">{pct}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color }} />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-gray-400">
                <span>
                  {formatCurrency(g.current)} of {formatCurrency(g.target)}
                </span>
                <span>{g.by}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 inline-flex rounded-md border border-white/10 px-2.5 py-1 text-[13px] text-gray-300">
        Add contribution
      </p>
    </div>
  );
}

function BudgetFragment() {
  return (
    <div data-ui aria-hidden="true" className={`mx-6 rounded-t-xl border-b-0 p-5 sm:mx-8 ${ui}`}>
      <div className="flex items-center justify-between text-[14px]">
        <span className="font-medium">Cibo & Ristoranti</span>
        <span className="tabular-nums text-gray-400">78%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[78%] rounded-full bg-primary" />
      </div>
      <p className="mt-2 text-[12px] text-gray-400">
        {formatCurrency(312.4)} of {formatCurrency(400)} this month
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
        <div>
          <p className="text-[14px]">Affitto</p>
          <p className="mt-0.5 text-[12px] text-gray-400">Monthly · next 1 Dec</p>
        </div>
        <span className="text-[14px] font-semibold tabular-nums text-red-400">−{formatCurrency(750)}</span>
      </div>
    </div>
  );
}

function ChartFragment() {
  // income vs expenses, last six months (demo values)
  const months = [
    ["Jun", 2500, 2310],
    ["Jul", 2500, 2620],
    ["Aug", 2700, 2190],
    ["Sep", 2500, 2380],
    ["Oct", 2500, 2274],
    ["Nov", 2500, 74],
  ];
  const max = 2800;
  return (
    <div data-ui aria-hidden="true" className={`mx-6 rounded-t-xl border-b-0 p-5 sm:mx-8 ${ui}`}>
      <div className="flex items-center gap-4 text-[12px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-green-400" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-400" /> Expenses
        </span>
      </div>
      <div className="mt-4 flex h-[120px] items-end justify-between gap-2">
        {months.map(([m, inc, out]) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-[100px] items-end gap-[3px]">
              <span className="w-2.5 rounded-t-sm bg-green-400/80" style={{ height: `${(inc / max) * 100}%` }} />
              <span className="w-2.5 rounded-t-sm bg-red-400/80" style={{ height: `${(out / max) * 100}%` }} />
            </div>
            <span className="text-[11px] text-gray-400">{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsvFragment() {
  return (
    <pre className="mx-6 overflow-hidden rounded-t-xl bg-[#0d0d15] p-5 text-[13px] leading-[1.7] text-[#c4c4d4] sm:mx-8">
      <code>
        {"date;description;amount\n"}
        {"2026-11-03;ESSELUNGA MILANO;-64,20\n"}
        {"2026-11-02;RICARICA ILIAD;-9,99\n"}
        {"2026-11-01;BONIFICO STIPENDIO;2500,00\n"}
        {"2026-10-31;TELEPASS PEDAGGI;-38,40"}
      </code>
    </pre>
  );
}

export default function FeatureGrid() {
  return (
    <div className="grid gap-2 lg:grid-cols-12">
      <Tile
        className="lg:col-span-7"
        title="Accounts and transactions"
        text="Checking, savings, wallet and cash accounts, each with its own balance. Recording an income or an expense updates that balance in the same database transaction, so the numbers never drift."
      >
        <AccountsFragment />
      </Tile>
      <Tile
        className="lg:col-span-5"
        title="Savings goals"
        text="Set a target and a date, add contributions as you go, and see how far along you are."
      >
        <GoalsFragment />
      </Tile>
      <Tile
        className="lg:col-span-4"
        title="Budgets and recurring"
        text="Give a category a monthly limit and see what is left. Rent, salary and subscriptions repeat on their own."
      >
        <BudgetFragment />
      </Tile>
      <Tile
        className="lg:col-span-4"
        title="Charts and insights"
        text="Income against spending month by month, a balance line per account, and three plain tips from your last 30 days."
      >
        <ChartFragment />
      </Tile>
      <Tile
        className="lg:col-span-4"
        title="CSV import and export"
        text="Bring in a bank export, take all your data out whenever you like. Nothing is locked in."
      >
        <CsvFragment />
      </Tile>
    </div>
  );
}

export function SecurityBand() {
  const points = [
    {
      title: "Sessions in httpOnly cookies",
      text: "Access and refresh tokens are never readable by page scripts, and a password reset signs out every session.",
    },
    {
      title: "Row-level security in PostgreSQL",
      text: "Each query runs with your user id set on the connection, so the database itself refuses rows that are not yours.",
    },
    {
      title: "Codes that expire",
      text: "E-mail verification codes are stored hashed, expire after 10 minutes and lock after 3 wrong attempts.",
    },
  ];
  return (
    <div className="mt-2 grid gap-8 bg-[#1A1A2E] p-6 sm:p-8 lg:grid-cols-12 lg:gap-8 lg:p-10">
      <h3 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-white lg:col-span-3">
        Private by design
      </h3>
      <ul className="grid gap-8 sm:grid-cols-3 lg:col-span-9">
        {points.map((p) => (
          <li key={p.title}>
            <p className="text-[18px] font-medium text-white">{p.title}</p>
            <p className="mt-2 text-[16px] leading-relaxed text-[#c4c4d4]">{p.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
