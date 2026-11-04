import { Check, Circle } from "lucide-react";
import { scorePassword } from "@/lib/passwordStrength";

const BAR = ["bg-red-500", "bg-red-500", "bg-orange-500", "bg-yellow-400", "bg-green-500"];

export function PasswordStrength({ password }) {
  const { score, label, checks } = scorePassword(password);
  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? BAR[score] : "bg-white/10"}`} />
          ))}
        </div>
        <span className="text-xs text-gray-400 w-16 text-right">{label}</span>
      </div>
      <ul className="grid grid-cols-1 gap-0.5">
        {checks.map((c) => (
          <li key={c.id} className={`text-xs flex items-center gap-1.5 ${c.passed ? "text-green-400" : "text-gray-500"}`}>
            {c.passed ? <Check size={12} /> : <Circle size={12} />} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
