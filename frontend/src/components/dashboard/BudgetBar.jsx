// Progress bar for a budget: fill colored by status, with a marker at the alert threshold.
export const BUDGET_STATUS = {
  ok: { bar: "bg-primary", text: "text-primary", label: "On track" },
  warning: { bar: "bg-amber-400", text: "text-amber-400", label: "Close to limit" },
  exceeded: { bar: "bg-red-500", text: "text-red-500", label: "Over budget" },
};

export const budgetStatusOf = (status) => BUDGET_STATUS[status] || BUDGET_STATUS.ok;

export function BudgetBar({ percentage, threshold, status = "ok", label, className = "" }) {
  const pct = Math.max(0, Number(percentage) || 0);
  const fill = Math.min(pct, 100);
  const style = budgetStatusOf(status);
  const marker = threshold !== undefined && threshold !== null && threshold > 0 && threshold < 100 ? Number(threshold) : null;

  return (
    <div className={`relative ${className}`}>
      <div
        role="progressbar"
        aria-label={label || "Budget used"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={`${Math.round(pct)}% of the limit used${marker ? `, alert at ${marker}%` : ""}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${fill}%` }} />
      </div>
      {marker !== null && (
        <span
          aria-hidden="true"
          title={`Alert at ${marker}%`}
          className="absolute -top-1 w-0.5 bg-white/70"
          style={{ left: `${marker}%`, height: "1.125rem" }}
        />
      )}
    </div>
  );
}
