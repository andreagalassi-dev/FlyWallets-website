import AuthCtas from "./AuthCtas";

export default function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-primary text-[#0d0d15]">
      <div className="lp-wrap grid gap-12 py-20 lg:min-h-[640px] lg:grid-cols-12 lg:items-end lg:gap-8 lg:py-24">
        <div className="lp-reveal lg:col-span-6">
          <h2
            id="cta-title"
            className="lp-display"
          >
            Open your
            <br />
            first wallet.
          </h2>
          <p className="mt-6 max-w-[40ch] text-[18px] leading-relaxed lg:text-[20px]">
            Create an account, confirm the code we e-mail you and add your first balance. No card, no
            subscription: FlyWallets is free software.
          </p>
          <AuthCtas tone="gold" className="mt-8 flex-wrap" />
        </div>

        <div className="lg:col-span-5 lg:col-start-8 lg:self-center">
          <div
            data-ui
            aria-hidden="true"
            className="mx-auto w-full max-w-[440px] rounded-xl border border-primary/10 bg-[#12121d] p-6 text-white shadow-[0_24px_60px_-20px_rgba(13,13,21,0.65)]"
          >
            <p className="text-[18px] font-semibold">Check your inbox</p>
            <p className="mt-1.5 text-[14px] text-gray-400">We sent a 6-digit code to you@example.com</p>
            <div className="mt-5 flex justify-between gap-2">
              {["4", "8", "1", "0", "2", ""].map((d, i) => (
                <span
                  key={i}
                  className={`flex h-14 flex-1 items-center justify-center rounded-md border text-[22px] font-semibold tabular-nums ${
                    i === 5 ? "border-primary bg-primary/[0.06]" : "border-white/15 bg-white/[0.03]"
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-5 flex h-11 items-center justify-center rounded-lg bg-primary text-[15px] font-medium text-[#0d0d15]">
              Verify e-mail
            </p>
            <p className="mt-4 text-center text-[13px] text-gray-400">Code expires in 10 minutes · Resend in 0:42</p>
          </div>
        </div>
      </div>
    </section>
  );
}
