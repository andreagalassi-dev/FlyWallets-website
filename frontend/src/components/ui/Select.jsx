import { twMerge } from "tailwind-merge";

export function Select({ className, children, ...props }) {
  return (
    <select
      className={twMerge(
        "flex h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-[#1A1A2E]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
