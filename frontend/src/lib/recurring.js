// Helpers for the recurring-transactions UI (pure, unit tested).

export const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const frequencyLabel = (value) => FREQUENCIES.find((f) => f.value === value)?.label || value || "";

/** The API reports "created" as a number when listing and as an array when processing. */
export function countOf(value) {
  if (Array.isArray(value)) return value.length;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Toast for the automatic processing done when listing: null if nothing was created. */
export function listingToastMessage(processed) {
  const created = countOf(processed?.created);
  if (created === 0) return null;
  return `${created} recurring ${created === 1 ? "transaction was" : "transactions were"} added`;
}

/** Message + toast type for the result of POST /recurring/process. */
export function processResultToast(result) {
  const created = countOf(result?.created);
  const errors = countOf(result?.errors);
  const pending = countOf(result?.pending);
  const deactivated = countOf(result?.deactivated);
  const parts = [];

  if (created > 0) parts.push(`${created} ${created === 1 ? "transaction" : "transactions"} created`);
  if (errors > 0) parts.push(`${errors} failed: check the warnings on the rules`);
  if (deactivated > 0) parts.push(`${deactivated} ${deactivated === 1 ? "rule" : "rules"} ended`);
  if (pending > 0) parts.push(`${pending} more ${pending === 1 ? "is" : "are"} still due: press "Process now" again`);

  if (parts.length === 0) return { type: "info", message: "Nothing to process right now: all rules are up to date" };
  return { type: errors > 0 && created === 0 ? "error" : created > 0 ? "success" : "info", message: parts.join(". ") };
}

/** Human warning for a rule whose last run failed, with a hint on how to fix it. */
export function ruleWarning(rule) {
  if (!rule?.last_error) return null;
  const base = String(rule.last_error).replace(/[.\s]+$/, "");
  if (/insufficient|overdraft|not enough/i.test(base)) {
    return `${base}. Add funds to the account or allow overdraft on it, then press "Process now" to retry.`;
  }
  return `${base}. Fix the issue, then press "Process now" to retry.`;
}

/** Message for a failed resume (PUT is_active true) on a rule whose end date has passed. */
export function resumeErrorHint(status, message) {
  if (status === 422) return `${message || "This rule has ended."} Edit it and move the end date forward, then resume.`;
  return message;
}
