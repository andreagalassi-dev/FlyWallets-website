import { formatCurrency } from "@/lib/format";
import { colorFor } from "@/lib/colors";
import { overdraftLabel } from "@/lib/overdraft";
import { Card } from "@/components/ui/Card";

const TYPE_LABEL = { checking: "Checking", savings: "Savings", wallet: "Wallet", cash: "Cash" };

export function AccountCard({ account, children }) {
  const hex = colorFor(account.color_tag);
  return (
    <Card className="!p-5 relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: hex }} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-400 truncate">{account.icon_emoji} {account.account_name}</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">{formatCurrency(account.current_balance, account.currency)}</p>
        </div>
        <span className="text-[11px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0" style={{ backgroundColor: `${hex}22`, color: hex }}>
          {TYPE_LABEL[account.account_type] || account.account_type}
        </span>
      </div>
      {overdraftLabel(account) && <p className="mt-2 text-xs text-primary/80">{overdraftLabel(account)}</p>}
      {children}
    </Card>
  );
}
