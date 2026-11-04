import { formatCurrency } from "@/lib/format";
import { COLOR_TAGS } from "@/lib/colors";

// Demo figures for the landing page. They add up: the three accounts sum to the total balance,
// and start balance + income - expenses over the 30 days equals the total (5,014.83 → 5,240.50, +4.5%).
const ACCOUNTS = [
  { name: "Main account", type: "Checking", balance: 3912.3, color: COLOR_TAGS.gold },
  { name: "Savings fund", type: "Savings", balance: 1150, color: COLOR_TAGS.blue },
  { name: "Cash wallet", type: "Cash", balance: 178.2, color: COLOR_TAGS.green },
];

export const RECENT = [
  { description: "Esselunga Milano", date: "3 Nov", category: "Cibo & Ristoranti", amount: 64.2, type: "expense" },
  { description: "Ricarica Iliad", date: "2 Nov", category: "Utenze", amount: 9.99, type: "expense" },
  { description: "Bonifico stipendio", date: "1 Nov", category: "Stipendio", amount: 2500, type: "income" },
];

const TOTAL = ACCOUNTS.reduce((sum, a) => sum + a.balance, 0);

// 30 daily balances: rent on day 3, steady spending, salary on day 27, two small payments after it.
function balanceSeries() {
  const start = 5014.83;
  const beforeSalary = 2814.69;
  const pts = [start, start - 24.6, start - 46.9, start - 796.9];
  const wobble = [0, 14, -9, 21, -4, 11, -16, 6, 18, -12, 3, -7, 15, -10, 8, -3, 12, -14, 5, 9, -6, 0, 0];
  const from = pts[3];
  for (let i = 1; i <= 23; i++) {
    const linear = from + ((beforeSalary - from) * i) / 23;
    pts.push(i === 23 ? beforeSalary : linear + wobble[i - 1]);
  }
  pts.push(beforeSalary + 2500, beforeSalary + 2500 - 9.99, TOTAL);
  return pts;
}

function Chart() {
  const data = balanceSeries();
  const w = 600;
  const h = 120;
  const min = Math.min(...data) - 200;
  const max = Math.max(...data) + 150;
  const x = (i) => (i / (data.length - 1)) * w;
  const y = (v) => h - ((v - min) / (max - min)) * h;
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-[120px] w-full" aria-hidden="true">
      <path d={area} fill="rgba(212,175,55,0.12)" />
      <path
        d={line}
        fill="none"
        stroke="#D4AF37"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength="1"
        className="lp-draw"
      />
      <circle cx={x(data.length - 1) - 3} cy={y(TOTAL)} r="4" fill="#D4AF37" />
    </svg>
  );
}

export function CategoryBadge({ name, type }) {
  const hex = type === "income" ? COLOR_TAGS.green : COLOR_TAGS.red;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium"
      style={{ backgroundColor: `${hex}22`, color: hex }}
    >
      {name}
    </span>
  );
}

export function TxAmount({ amount, type }) {
  const income = type === "income";
  return (
    <span className={`text-[14px] font-semibold tabular-nums ${income ? "text-green-400" : "text-red-400"}`}>
      {income ? "+" : "−"}
      {formatCurrency(amount)}
    </span>
  );
}

export default function DashboardPreview() {
  const goalPct = Math.round((640 / 1500) * 100);
  return (
    <div
      data-ui
      className="w-[640px] rounded-xl border border-primary/10 bg-[#12121d] p-6 text-white"
      aria-label="Example FlyWallets dashboard with demo data"
      role="img"
    >
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold">Overview</p>
        <span className="rounded-md border border-white/10 px-2.5 py-1 text-[13px] text-gray-300">Last 30 days</span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-6">
        <div>
          <p className="text-[13px] text-gray-400">Total balance</p>
          <p className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums">{formatCurrency(TOTAL)}</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[13px] text-gray-400">In</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-green-400">{formatCurrency(2500)}</p>
          </div>
          <div>
            <p className="text-[13px] text-gray-400">Out</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-red-400">{formatCurrency(2274.33)}</p>
          </div>
          <div>
            <p className="text-[13px] text-gray-400">Change</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-primary">+4,5%</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Chart />
      </div>

      <div className="mt-5 grid grid-cols-[1.25fr_1fr] gap-6">
        <div>
          <p className="text-[13px] font-medium text-gray-400">Recent transactions</p>
          <ul className="mt-1">
            {RECENT.map((tx) => (
              <li
                key={tx.description}
                className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px]">{tx.description}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <CategoryBadge name={tx.category} type={tx.type} />
                    <span className="text-[12px] text-gray-400">{tx.date}</span>
                  </div>
                </div>
                <TxAmount amount={tx.amount} type={tx.type} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[13px] font-medium text-gray-400">Accounts</p>
          <ul className="mt-1">
            {ACCOUNTS.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-3 py-[7px]">
                <span className="flex items-center gap-2 text-[14px]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                  {a.name}
                </span>
                <span className="text-[14px] tabular-nums text-gray-200">{formatCurrency(a.balance)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-white/[0.04] p-3">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium">Summer holiday</span>
              <span className="text-gray-400">{goalPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-gray-400">
              {formatCurrency(640)} of {formatCurrency(1500)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
