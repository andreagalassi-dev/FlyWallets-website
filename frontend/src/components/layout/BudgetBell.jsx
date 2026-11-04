'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import useBudgetAlerts from '@/hooks/useBudgetAlerts';
import { formatCurrency } from '@/lib/format';
import { colorFor } from '@/lib/colors';

const PANEL_ID = 'budget-alerts-panel';

/** Header bell: badge with the number of budget alerts and a dropdown listing them. */
export function BudgetBell() {
  const { alerts, count, refresh } = useBudgetAlerts();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    const onPointerDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    // Opening shows fresh data
    if (!open) refresh();
    setOpen((o) => !o);
  };

  const onBlur = (e) => {
    // Keyboard users tabbing past the panel close it
    if (open && wrapperRef.current && e.relatedTarget && !wrapperRef.current.contains(e.relatedTarget)) setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative" onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="relative text-gray-400 hover:text-white transition-colors p-1"
        aria-label={count > 0 ? `Notifications, ${count} budget ${count === 1 ? 'alert' : 'alerts'}` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={PANEL_ID}
      >
        <Bell size={20} />
        {count > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          id={PANEL_ID}
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Budget alerts"
          className="fixed inset-x-3 top-[4.25rem] z-30 rounded-xl border border-white/10 bg-secondary shadow-xl focus:outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[360px]"
        >
          <div className="border-b border-white/5 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Budget alerts</h3>
          </div>

          {count === 0 ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm text-gray-400">
              <CheckCircle2 size={16} className="shrink-0 text-green-400" />
              No alerts. You&apos;re within all your budgets.
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-white/5">
              {alerts.map((a) => {
                const critical = a.severity === 'critical' || a.status === 'exceeded';
                return (
                  <li key={a.budget_id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                      style={{ backgroundColor: `${colorFor(a.category_color)}22` }}
                      aria-hidden="true"
                    >
                      {a.category_emoji || '💸'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{a.category_name}</p>
                      <p className="text-xs text-gray-400 tabular-nums">
                        {formatCurrency(a.spent)} of {formatCurrency(a.monthly_limit)} ·{' '}
                        <span className={clsx('font-semibold', critical ? 'text-red-400' : 'text-amber-400')}>{Math.round(Number(a.percentage) || 0)}%</span>
                      </p>
                      <p className={clsx('mt-0.5 text-xs', critical ? 'text-red-400' : 'text-amber-400')}>
                        {critical ? 'Over budget' : 'Close to the limit'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-white/5 px-4 py-2.5">
            <Link href="/dashboard/budgets" onClick={() => setOpen(false)} className="text-sm font-medium text-primary hover:underline">
              Manage budgets
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
