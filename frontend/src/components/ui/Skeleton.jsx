import { twMerge } from "tailwind-merge";

export function Skeleton({ className }) {
  return <div className={twMerge("animate-pulse rounded-md bg-white/10", className)} />;
}
