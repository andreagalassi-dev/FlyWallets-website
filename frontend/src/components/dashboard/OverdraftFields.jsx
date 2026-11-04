"use client";

import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Modal";

/** Overdraft checkbox + optional limit. `value` = { overdraft_allowed, overdraft_limit } (see lib/overdraft.js). */
export function OverdraftFields({ value, onChange }) {
  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.overdraft_allowed}
          onChange={(e) => onChange({ ...value, overdraft_allowed: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
        />
        <span>
          <span className="block text-sm font-medium text-gray-300">Allow overdraft</span>
          <span className="block text-xs text-gray-500">Let this account go below zero. Otherwise operations that would do so are refused.</span>
        </span>
      </label>
      {value.overdraft_allowed && (
        <Field label="Overdraft limit (€, optional)">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={value.overdraft_limit}
            onChange={(e) => onChange({ ...value, overdraft_limit: e.target.value })}
            placeholder="Empty = unlimited"
          />
        </Field>
      )}
    </div>
  );
}
