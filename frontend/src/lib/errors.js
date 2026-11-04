/** Extracts a human message from an axios error (API message, validation errors, or fallback). */
export function getErrorMessage(err, fallback = "Something went wrong") {
  const data = err?.response?.data;
  if (data?.message) return data.message;
  if (Array.isArray(data?.errors) && data.errors.length) return data.errors[0].msg;
  if (err?.code === "ERR_NETWORK") return "Cannot reach the server. Check your connection.";
  return fallback;
}

/** Machine-readable `code` of an API error (e.g. "INSUFFICIENT_FUNDS"), or undefined. */
export function getErrorCode(err) {
  return err?.response?.data?.code;
}

// Codes whose message is replaced by a fixed, friendly one
const FIXED_MESSAGES = {
  EMAIL_NOT_VERIFIED: "Verify your e-mail to make changes",
  REFRESH_TOKEN_REUSED: "Your session was closed for security reasons. Please sign in again.",
};

// Codes where the API message (it has the numbers) gets a hint on how to fix it
const HINTS = {
  INSUFFICIENT_FUNDS: "Lower the amount, pick another account or allow overdraft on it.",
  OVERDRAFT_LIMIT_CONFLICT: "Add money to the account first, or choose a higher overdraft limit.",
};

/** Like getErrorMessage, but maps known API error codes to friendly, actionable messages. */
export function getFriendlyErrorMessage(err, fallback = "Something went wrong") {
  const code = getErrorCode(err);
  if (FIXED_MESSAGES[code]) return FIXED_MESSAGES[code];
  const base = getErrorMessage(err, fallback);
  if (!HINTS[code]) return base;
  return `${base.replace(/[.\s]+$/, "")}. ${HINTS[code]}`;
}
