import "@/components/landing/landing.css";
import LandingNav from "@/components/landing/LandingNav";
import AuthCtas from "@/components/landing/AuthCtas";
import DashboardPreview from "@/components/landing/DashboardPreview";
import CategorizeDemo from "@/components/landing/CategorizeDemo";
import FeatureGrid, { SecurityBand } from "@/components/landing/FeatureGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import FinalCta from "@/components/landing/FinalCta";
import LandingFooter from "@/components/landing/LandingFooter";

const FACTS = [
  "Free and open source under the MIT License.",
  "Self-hosted with Docker and PostgreSQL.",
  "Reads Italian bank statement lines out of the box.",
];

export default function Home() {
  return (
    <div className="lp-page overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-[#0d0d15]"
      >
        Skip to content
      </a>
      <LandingNav />

      <main id="main">
        {/* Hero: the headline upper left, the dashboard on a gold stage bleeding off the right and bottom */}
        <section aria-labelledby="hero-title" className="lp-wrap lg:grid lg:min-h-[calc(100svh-80px)] lg:max-h-[1040px] lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col pt-10 sm:pt-16 lg:col-span-6 lg:pb-14 lg:pt-[12svh] xl:col-span-5">
            <h1 id="hero-title" className="lp-display lp-rise text-white">
              Every euro,
              <br />
              in its place.
            </h1>
            <p
              className="lp-rise mt-6 max-w-[42ch] text-[18px] leading-relaxed text-[#e4e4ec] lg:text-[20px]"
              style={{ "--lp-delay": "90ms" }}
            >
              FlyWallets keeps your accounts, transactions and savings goals in one calm dashboard, and files every
              payment under the right category for you.
            </p>
            <div className="lp-rise mt-8" style={{ "--lp-delay": "180ms" }}>
              <AuthCtas />
            </div>
            <ul className="mt-auto hidden space-y-1.5 pt-12 text-[16px] text-[#c4c4d4] lg:block">
              {FACTS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <div className="relative -mx-5 mt-12 sm:-mx-8 lg:col-span-6 lg:col-start-7 lg:mx-0 lg:mr-[calc(-1*(max(0px,(100vw_-_1440px)/2)_+_2.5rem))] lg:mt-[12svh] xl:col-span-7 xl:col-start-6">
            <div className="lp-stage lp-shutter h-[440px] overflow-hidden bg-primary pl-4 pt-16 sm:h-[540px] sm:pl-14 sm:pt-14 lg:absolute lg:inset-0 lg:h-auto">
              <div className="lp-settle">
                <DashboardPreview />
              </div>
            </div>
          </div>

          <ul className="mt-10 space-y-1.5 text-[16px] text-[#c4c4d4] lg:hidden">
            {FACTS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>

        {/* The live piece: a bank line goes in, a category comes out */}
        <section id="categorisation" aria-labelledby="sort-title" className="lp-wrap mt-28 scroll-mt-8 lg:mt-44">
          <div className="lp-reveal grid gap-6 lg:grid-cols-12 lg:gap-8">
            <h2 id="sort-title" className="lp-h2 text-white lg:col-span-6">
              Sorted the moment
              <br className="hidden sm:block" /> it lands
            </h2>
            <p className="max-w-[48ch] text-[18px] leading-relaxed text-[#e4e4ec] lg:text-[20px] lg:col-span-5 lg:col-start-8 lg:self-end">
              Pick a line from a real statement, or type your own. A keyword engine files it under one of 25 built-in
              categories; connect Gemini or OpenAI if you want a second opinion.
            </p>
          </div>
          <div className="mt-12 lg:mt-16">
            <CategorizeDemo />
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className="lp-wrap mt-28 scroll-mt-8 lg:mt-44">
          <div className="lp-reveal">
            <h2 id="features-title" className="lp-h2 max-w-[18ch] text-white">
              Everything a month of money needs
            </h2>
          </div>
          <div className="mt-12 lg:mt-16">
            <FeatureGrid />
            <SecurityBand />
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-title" className="lp-wrap mb-28 mt-28 scroll-mt-8 lg:mb-44 lg:mt-44">
          <div className="lp-reveal lg:ml-[25%]">
            <h2 id="how-title" className="lp-h2 text-white">
              From sign-up to sorted
            </h2>
          </div>
          <div className="mt-14">
            <HowItWorks />
          </div>
        </section>

        <FinalCta />
      </main>

      <LandingFooter />
    </div>
  );
}
