import Logo from "@/components/brand/Logo";
import AuthCtas from "./AuthCtas";

export const REPO_URL = "https://github.com/andreagalassi-dev/FlyWallets-website";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: REPO_URL, label: "Source code" },
];

export default function LandingNav() {
  return (
    <header className="lp-wrap flex h-[72px] items-center justify-between gap-4 sm:h-20">
      <Logo href="/" size="inherit" className="text-[18px] sm:text-[22px]" />
      <nav aria-label="Main" className="flex items-center gap-8">
        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-sm text-[15px] text-[#c9c9d6] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <AuthCtas size="sm" secondaryFirst className="gap-3 sm:gap-5" />
      </nav>
    </header>
  );
}
