'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { SidebarContent } from '@/components/layout/Sidebar';

export const MOBILE_NAV_ID = 'mobile-nav';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Off-canvas navigation for < md screens. Always mounted (so it can slide), but invisible and
 * non-focusable while closed. Closes on backdrop click, Escape, link click and when the viewport
 * grows to the desktop layout; locks body scroll while open.
 */
export function MobileNav({ open, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Keep keyboard focus inside the drawer
      const items = panelRef.current.querySelectorAll(FOCUSABLE);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const mq = window.matchMedia('(min-width: 768px)');
    const onBreakpoint = (e) => e.matches && onClose();

    document.addEventListener('keydown', onKeyDown);
    mq.addEventListener('change', onBreakpoint);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      mq.removeEventListener('change', onBreakpoint);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 md:hidden',
        // `invisible` is applied after the slide-out finishes so the closed drawer is not focusable
        open ? 'visible' : 'invisible transition-[visibility] delay-300'
      )}
    >
      <div
        className={clsx(
          'absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id={MOBILE_NAV_ID}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={clsx(
          'absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-white/5 bg-secondary transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-xl font-bold text-primary tracking-tight">FlyWallets</span>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-white"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
