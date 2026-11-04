import Link from "next/link";
import { twMerge } from "tailwind-merge";

// The FlyWallets mark: a paper-plane wing lifting off a wallet. Same geometry as src/app/icon.svg,
// without the dark tile so it sits directly on any dark surface.
export function LogoMark({ className, title }) {
  return (
    <svg
      viewBox="4 2 24 27.5"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d="M5 9.5 27.5 3 12 11Z" fill="#D4AF37" />
      <path d="M12 11 27.5 3 18 12.5Z" fill="#9C7F22" />
      <path
        fill="#D4AF37"
        fillRule="evenodd"
        d="M7.5 14.5h16a3 3 0 0 1 3 3V19H22a2.5 2.5 0 0 0 0 5h4.5v1.5a3 3 0 0 1-3 3h-16a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3ZM22 20.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 1 0 0-2.5Z"
      />
    </svg>
  );
}

const SIZES = { sm: 18, md: 22, lg: 30 };

/**
 * Mark + wordmark.
 * @param {'sm'|'md'|'lg'|'inherit'|number|string} size  wordmark font size: preset, px number, any CSS length,
 *        or "inherit" to size it with a font-size class (e.g. responsive Tailwind classes)
 * @param {string} [href]  wraps the logo in a link (e.g. "/")
 * @param {boolean} [wordmark=true]  false renders the mark alone (with an accessible name)
 */
export default function Logo({ size = "md", href, wordmark = true, className, ...props }) {
  const fontSize = size === "inherit" ? undefined : SIZES[size] ?? size;
  const content = (
    <span
      className={twMerge("inline-flex items-center gap-[0.4em] font-semibold leading-none tracking-[-0.03em] text-white", className)}
      style={fontSize === undefined ? undefined : { fontSize }}
      {...props}
    >
      <LogoMark className="h-[1.3em] w-auto shrink-0" title={wordmark ? undefined : "FlyWallets"} />
      {wordmark && <span>FlyWallets</span>}
    </span>
  );

  if (!href) return content;
  return (
    <Link
      href={href}
      aria-label={wordmark ? undefined : "FlyWallets home"}
      className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      {content}
    </Link>
  );
}
