import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { REPO_URL } from "./LandingNav";

const linkCls =
  "rounded-sm text-[16px] text-white transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

export default function LandingFooter() {
  return (
    <footer className="grid gap-2 p-2 sm:p-3 lg:grid-cols-12" aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">
        About FlyWallets
      </h2>

      <div className="order-4 flex flex-col justify-between gap-6 bg-[#14141f] p-6 lg:order-none lg:col-span-5 lg:p-8">
        <p className="max-w-[30ch] text-[18px] leading-snug text-white">
          FlyWallets is free, open-source personal finance software.
        </p>
        <p className="text-[14px] text-[#a3a3b8]">MIT License</p>
      </div>

      <nav aria-label="Footer" className="order-3 bg-[#14141f] p-6 lg:order-none lg:col-span-3 lg:p-8">
        <ul className="space-y-2.5">
          <li>
            <Link href="/login" className={linkCls}>
              Sign in
            </Link>
          </li>
          <li>
            <Link href="/register" className={linkCls}>
              Create an account
            </Link>
          </li>
          <li>
            <a href="#features" className={linkCls}>
              Features
            </a>
          </li>
          <li>
            <a href="#how-it-works" className={linkCls}>
              How it works
            </a>
          </li>
        </ul>
      </nav>

      <div className="order-3 flex flex-col justify-end bg-[#14141f] p-6 lg:order-none lg:col-span-4 lg:min-h-[180px] lg:p-8">
        <p className="text-[14px] text-[#a3a3b8]">Code, issues and releases</p>
        <a href={REPO_URL} className={`${linkCls} mt-2 break-words`}>
          github.com/andreagalassi-dev/FlyWallets-website
        </a>
      </div>
      <div className="order-1 flex min-h-[160px] items-center justify-center bg-[#1A1A2E] p-6 lg:order-none lg:col-span-8 lg:min-h-[300px]">
        <Logo href="/" size="clamp(40px, 7vw, 112px)" />
      </div>

      <a
        href={REPO_URL}
        className="lp-tile-link group relative order-2 flex min-h-[160px] flex-col justify-between bg-primary p-6 text-[#0d0d15] hover:bg-[#e2c35a] focus-visible:outline focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-[#0d0d15] lg:order-none lg:col-span-4 lg:min-h-[300px] lg:p-8"
      >
        <span className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">Read the source</span>
        <svg
          className="lp-arrow ml-auto h-12 w-12"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="square"
          aria-hidden="true"
        >
          <path d="M12 36 36 12M16 12h20v20" />
        </svg>
      </a>

    </footer>
  );
}
