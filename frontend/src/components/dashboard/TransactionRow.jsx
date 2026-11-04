import { formatCurrency, formatDate } from "@/lib/format";
import { colorFor } from "@/lib/colors";

export function CategoryBadge({ name, emoji, color }) {
  if (!name) return <span className="text-xs text-gray-500">Uncategorized</span>;
  const hex = colorFor(color);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${hex}22`, color: hex }}
    >
      {emoji} {name}
    </span>
  );
}

export function Amount({ amount, type, currency }) {
  const income = type === "income";
  return (
    <span className={`font-semibold tabular-nums ${income ? "text-green-400" : "text-red-400"}`}>
      {income ? "+" : "−"}{formatCurrency(amount, currency)}
    </span>
  );
}

export function TransactionRow({ tx, action }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{tx.description}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <CategoryBadge name={tx.category_name} emoji={tx.category_emoji} color={tx.category_color} />
          <span className="text-xs text-gray-500">{formatDate(tx.transaction_date)}</span>
          {tx.account_name && <span className="text-xs text-gray-500">· {tx.account_name}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Amount amount={tx.amount} type={tx.transaction_type} currency={tx.currency} />
        {action}
      </div>
    </div>
  );
}
