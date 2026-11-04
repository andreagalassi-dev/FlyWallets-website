import { formatCurrency } from "./format.js";

/** Form state (checkbox + limit text) from an account row. */
export function overdraftFormState(account) {
  return {
    overdraft_allowed: !!account?.overdraft_allowed,
    overdraft_limit: account?.overdraft_limit == null ? "" : String(Number(account.overdraft_limit)),
  };
}

/** API fields from the form state. Empty limit = unlimited (null); no overdraft sends only the flag. */
export function overdraftPayload({ overdraft_allowed, overdraft_limit }) {
  if (!overdraft_allowed) return { overdraft_allowed: false };
  const trimmed = String(overdraft_limit ?? "").trim();
  return { overdraft_allowed: true, overdraft_limit: trimmed === "" ? null : Number(trimmed) };
}

/** Short hint for account cards, or null when overdraft is off. */
export function overdraftLabel(account) {
  if (!account?.overdraft_allowed) return null;
  if (account.overdraft_limit == null) return "Overdraft allowed";
  return `Overdraft up to ${formatCurrency(account.overdraft_limit, account.currency)}`;
}
