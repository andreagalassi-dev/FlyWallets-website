"use client";

import { useId, useState } from "react";
import { categorize } from "@/lib/demoCategorize";
import { formatCurrency } from "@/lib/format";
import { CategoryBadge } from "./DashboardPreview";

// Lines as an Italian bank prints them on a statement; amounts are demo values.
const EXAMPLES = [
  { line: "Esselunga Milano Via Foppa", amount: 64.2, type: "expense" },
  { line: "Ricarica Iliad online", amount: 9.99, type: "expense" },
  { line: "Bonifico stipendio ottobre", amount: 2500, type: "income" },
  { line: "Telepass addebito pedaggi", amount: 38.4, type: "expense" },
  { line: "Netflix.com abbonamento", amount: 13.99, type: "expense" },
];

export default function CategorizeDemo() {
  const [selected, setSelected] = useState(0);
  const [custom, setCustom] = useState("");
  const inputId = useId();

  const usingCustom = custom.trim().length > 0;
  const example = EXAMPLES[selected];
  const line = usingCustom ? custom.trim() : example.line;
  const result = categorize(line, usingCustom ? null : example.type);
  const type = usingCustom ? result.type : example.type;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-5">
        <ul className="flex flex-wrap gap-2 lg:block">
          {EXAMPLES.map((ex, i) => {
            const active = !usingCustom && i === selected;
            return (
              <li key={ex.line}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelected(i);
                    setCustom("");
                  }}
                  className={`lp-press rounded px-3 py-2 text-left text-[16px] font-medium leading-tight tracking-[-0.01em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:-ml-3 lg:py-2.5 lg:text-[24px] ${
                    active ? "bg-[#1A1A2E] text-white lg:bg-transparent" : "bg-[#14141f] text-[#a3a3b8] hover:text-white lg:bg-transparent"
                  }`}
                >
                  {ex.line}
                </button>
              </li>
            );
          })}
        </ul>

        <label htmlFor={inputId} className="mt-8 block text-[16px] text-white">
          Or type a line from your own statement
        </label>
        <input
          id={inputId}
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="e.g. Farmacia Comunale 12"
          maxLength={80}
          autoComplete="off"
          className="mt-3 h-12 w-full max-w-md rounded bg-[#1A1A2E] px-4 text-[16px] text-white placeholder:text-[#8d8da6] focus:outline focus:outline-2 focus:outline-primary"
        />
      </div>

      <div className="relative -mx-5 self-end overflow-hidden bg-[#1A1A2E] px-4 pt-6 sm:mx-0 sm:px-10 sm:pt-12 lg:col-span-7 lg:px-16 lg:pt-16">
        <div
          key={line}
          data-ui
          className="lp-swap w-[min(100%,460px)] rounded-t-xl border border-b-0 border-primary/10 bg-[#0d0d15] p-6 pb-8 text-white"
        >
          <p className="text-[15px] font-semibold">New transaction</p>

          <p className="mt-5 text-[13px] text-gray-400">Description</p>
          <p className="mt-1.5 truncate rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px]">{line}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[13px] text-gray-400">Amount</p>
              <p className="mt-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] tabular-nums">
                {usingCustom ? "—" : `${type === "income" ? "+" : "−"}${formatCurrency(example.amount)}`}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-gray-400">Type</p>
              <div className="mt-1.5 grid grid-cols-2 rounded-md border border-white/10 p-0.5 text-center text-[13px]">
                <span className={`rounded py-[7px] ${type === "income" ? "bg-green-500/15 text-green-400" : "text-gray-400"}`}>Income</span>
                <span className={`rounded py-[7px] ${type === "expense" ? "bg-red-500/15 text-red-400" : "text-gray-400"}`}>Expense</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-[13px] text-gray-400">Category</p>
          <div
            className="mt-1.5 flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/[0.06] px-3 py-2.5"
            aria-live="polite"
          >
            <CategoryBadge name={result.name} type={type} />
            <span className="text-[12px] text-gray-400">
              {result.keyword ? <>matched “{result.keyword}”</> : "no keyword, default category"}
            </span>
          </div>

          <p className="mt-4 text-[13px] text-gray-400">Account</p>
          <p className="mt-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px]">Main account</p>
        </div>
      </div>
    </div>
  );
}
