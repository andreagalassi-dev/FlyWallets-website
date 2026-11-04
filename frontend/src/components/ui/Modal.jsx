"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, description, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className={`glass-card !bg-secondary w-full ${size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-xl" : "max-w-md"} max-h-[90vh] overflow-y-auto p-6`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-md">{message}</div>;
}
