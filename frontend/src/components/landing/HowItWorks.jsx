import { formatCurrency } from "@/lib/format";
import { CategoryBadge, TxAmount } from "./DashboardPreview";

// What you give (call) and what comes back (response), three times.

const field = "rounded bg-[#1A1A2E] px-5 py-4 text-[16px] text-white";
const ui = "rounded-xl border border-primary/10 bg-[#12121d] p-5 text-white";

function Step({ lead, call, children, wide = false }) {
  return (
    <li className="lp-reveal">
      <p className="text-[20px] font-medium leading-snug text-white">{lead}</p>
      <div className="mt-4">{call}</div>
      <div className={`mt-6 sm:ml-14 ${wide ? "lg:w-[760px]" : ""}`}>{children}</div>
    </li>
  );
}

export default function HowItWorks() {
  return (
    <ol className="space-y-20 lg:ml-[25%] lg:max-w-[560px]">
      <Step
        lead="First, create your account with an e-mail and a password."
        call={<p className={field}>you@example.com</p>}
      >
        <div
          data-ui
          aria-hidden="true"
          className="flex max-w-[420px] items-start gap-3 rounded-xl border border-primary/30 bg-[#1A1A2E] px-4 py-3 text-primary"
        >
          <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
          <p className="text-[14px] leading-snug">
            We sent a 6-digit code to you@example.com. It expires in 10 minutes.
          </p>
        </div>
      </Step>

      <Step
        lead="Then add an account and its opening balance."
        call={
          <div className={`${field} flex items-center justify-between gap-4`}>
            <span>Main account</span>
            <span className="tabular-nums text-[#c4c4d4]">{formatCurrency(3912.3)}</span>
          </div>
        }
      >
        <div data-ui aria-hidden="true" className={`${ui} flex max-w-[420px] items-center justify-between gap-3`}>
          <span className="flex items-center gap-2.5 text-[14px]">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            Main account
            <span className="text-[12px] text-gray-400">Checking</span>
          </span>
          <span className="text-[14px] tabular-nums">{formatCurrency(3912.3)}</span>
        </div>
      </Step>

      <Step
        lead="Finally, record what you spend, or import your bank's CSV."
        call={
          <pre className="overflow-x-auto rounded bg-[#1A1A2E] px-5 py-4 text-[14px] text-[#c4c4d4]">
            <code>2026-11-03;ESSELUNGA MILANO;-64,20</code>
          </pre>
        }
        wide
      >
        <div data-ui aria-hidden="true" className={`${ui} grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center`}>
          <div className="min-w-0">
            <p className="truncate text-[14px]">Esselunga Milano</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <CategoryBadge name="Cibo & Ristoranti" type="expense" />
              <span className="text-[12px] text-gray-400">3 Nov · Main account</span>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:justify-end">
            <TxAmount amount={64.2} type="expense" />
            <span className="text-[13px] text-gray-400">
              Balance <span className="tabular-nums text-white">{formatCurrency(3848.1)}</span>
            </span>
          </div>
        </div>
      </Step>
    </ol>
  );
}
