const NODES = [
  { icon: "🔒", label: "Wallet A", sub: "private holder", tone: "neutral" },
  { icon: "🎫", label: "Prova Pass", sub: "bearer capability", tone: "indigo" },
  { icon: "🔓", label: "Wallet B", sub: "fresh, zero gas", tone: "emerald" },
] as const;

const TONE_CLASSES: Record<string, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-800",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function HeroFlow() {
  return (
    <div>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        {NODES.map((n, i) => (
          <div key={n.label} className="flex items-center gap-3 sm:gap-4">
            <div
              className={`flex min-w-[9rem] flex-col items-center gap-1.5 rounded-2xl border px-5 py-4 ${TONE_CLASSES[n.tone]}`}
            >
              <span className="text-2xl">{n.icon}</span>
              <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{n.label}</span>
              <span className="text-sm font-medium">{n.sub}</span>
            </div>
            {i < NODES.length - 1 && (
              <svg className="hidden h-4 w-8 text-neutral-300 sm:block" viewBox="0 0 32 16" fill="none">
                <path
                  d="M0 8H30M30 8L23 1M30 8L23 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-neutral-500">
        No on-chain link, no shared address, no Prova-stored mapping between A and B: the pass
        itself is the only thing that crosses between them.
      </p>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live on Starknet mainnet · Built for the STRK20 Private Sprint
        </span>

        <h1 className="mt-8 max-w-3xl text-4xl font-semibold tracking-tight text-neutral-900 sm:text-6xl">
          Private balances, turned into
          <span className="block text-indigo-600">portable capabilities.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-neutral-600">
          Prove something about a wallet&apos;s STRK20 pool activity. Get a one-time bearer
          capability, one that can carry a real reward, not just a record. Redeem it from any
          wallet on earth, with nothing on-chain linking the two.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href="#app"
            className="rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-neutral-900/10 transition-transform hover:-translate-y-0.5 hover:bg-neutral-800"
          >
            Try the live demo
          </a>
          <a
            href="https://github.com/levithefirst/provah"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-neutral-300 bg-white px-7 py-3.5 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400"
          >
            View on GitHub
          </a>
        </div>

        <div className="mt-16 w-full max-w-3xl rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-xl shadow-neutral-900/5 backdrop-blur sm:p-10">
          <HeroFlow />
        </div>
      </div>
    </section>
  );
}
