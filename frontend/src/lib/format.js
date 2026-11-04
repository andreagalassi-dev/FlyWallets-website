export function formatCurrency(amount, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(Number(amount) || 0);
}

// Accepts 'YYYY-MM-DD' (API DATE columns) or full ISO timestamps
export function formatDate(value) {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 'YYYY-MM-DD' (API DATE) or full ISO timestamp -> 'YYYY-MM-DD' for <input type="date"> (local calendar day)
export function toDateInputValue(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
