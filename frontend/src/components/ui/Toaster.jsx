"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import useToastStore, { showFlashToast } from "@/store/toastStore";

const STYLES = {
  success: { icon: CheckCircle2, cls: "border-green-500/30 text-green-400" },
  error: { icon: AlertCircle, cls: "border-red-500/30 text-red-400" },
  info: { icon: Info, cls: "border-primary/30 text-primary" },
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  // Toasts queued before a full-page redirect (see flashToast)
  useEffect(() => {
    showFlashToast();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)]" role="status" aria-live="polite">
      {toasts.map((t) => {
        const { icon: Icon, cls } = STYLES[t.type] || STYLES.info;
        return (
          <div key={t.id} className={`glass-card !bg-secondary/95 border ${cls} px-4 py-3 flex items-start gap-3 shadow-lg`}>
            <Icon size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-white">{t.message}</p>
              {t.action && (
                <Link href={t.action.href} onClick={() => dismiss(t.id)} className="inline-block mt-1 text-sm font-medium text-primary hover:underline">
                  {t.action.label}
                </Link>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-gray-500 hover:text-white" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
