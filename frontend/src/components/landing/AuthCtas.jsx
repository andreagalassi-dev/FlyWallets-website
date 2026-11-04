"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { twMerge } from "tailwind-merge";
import useAuthStore from "@/store/authStore";

const noop = () => () => {};
// false during SSR and hydration, true afterwards: the persisted auth flag lives in localStorage,
// so reading it before hydration would make server and client markup disagree.
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

const base =
  "lp-press inline-flex items-center justify-center rounded font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

const TONES = {
  // on the dark ground
  dark: {
    primary: "bg-primary text-[#0d0d15] hover:bg-[#e2c35a] focus-visible:outline-primary",
    secondary: "text-white hover:text-primary focus-visible:outline-primary",
  },
  // on the gold field
  gold: {
    primary: "bg-[#0d0d15] text-white hover:bg-[#1A1A2E] focus-visible:outline-[#0d0d15]",
    secondary: "text-[#0d0d15] underline decoration-2 underline-offset-4 hover:decoration-[#0d0d15]/40 focus-visible:outline-[#0d0d15]",
  },
};

const SIZES = {
  sm: "h-10 px-4 text-[15px]",
  lg: "h-12 px-6 text-[18px]",
};

export default function AuthCtas({ tone = "dark", size = "lg", secondaryFirst = false, className, secondaryClassName }) {
  const hydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const t = TONES[tone];
  const s = SIZES[size];

  if (hydrated && isAuthenticated) {
    return (
      <div className={twMerge("flex items-center gap-5", className)}>
        <Link href="/dashboard" className={twMerge(base, s, t.primary)}>
          Open dashboard
        </Link>
      </div>
    );
  }

  const primary = (
    <Link href="/register" className={twMerge(base, s, t.primary)}>
      Get started
    </Link>
  );
  const secondary = (
    <Link href="/login" className={twMerge(base, s, "px-1", t.secondary, secondaryClassName)}>
      Sign in
    </Link>
  );

  return (
    <div className={twMerge("flex items-center gap-5", className)}>
      {secondaryFirst ? secondary : primary}
      {secondaryFirst ? primary : secondary}
    </div>
  );
}
