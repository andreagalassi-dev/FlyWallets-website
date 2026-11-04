import { formatCurrency, formatDate } from "@/lib/format";
import { colorFor } from "@/lib/colors";

export function GoalProgress({ goal, children }) {
  const hex = colorFor(goal.color_tag, "#3B82F6");
  const pct = goal.progress_percentage ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white truncate">{goal.icon_emoji} {goal.goal_name}</p>
        <span className="text-xs text-gray-400 shrink-0">{pct}%{goal.is_completed ? " ✓" : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hex }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatCurrency(goal.current_amount, goal.currency)} of {formatCurrency(goal.target_amount, goal.currency)}</span>
        {goal.target_date && <span>by {formatDate(goal.target_date)}</span>}
      </div>
      {children}
    </div>
  );
}
