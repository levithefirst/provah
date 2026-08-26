import { Lock, Ticket, Unlock } from "lucide-react";

const NODES = [
  { Icon: Lock, label: "Wallet A", sub: "proves eligibility", tone: "neutral" },
  { Icon: Ticket, label: "Capability", sub: "one-time, bearer", tone: "indigo" },
  { Icon: Unlock, label: "Wallet B", sub: "claims it, zero gas", tone: "emerald" },
] as const;

const TONE_CLASSES: Record<string, string> = {
  neutral:
    "border-neutral-200 bg-neutral-50 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200",
  indigo:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

function HeroFlow() {
  return (
    <div>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        {NODES.map((n, i) => (
          <div key={n.label} className="flex items-center gap-3 sm:gap-4">
            <div
              className={`flex min-w-[9rem] flex-col items-center gap-1.5 rounded-2xl border px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 ${TONE_CLASSES[n.tone]}`}
            >
              <n.Icon className="h-6 w-6" strokeWidth={1.75} />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{n.label}</span>
              <span className="text-sm font-medium">{n.sub}</span>
            </div>
            {i < NODES.length - 1 && (
              <svg
                className="hidden h-4 w-8 text-neutral-300 sm:block dark:text-neutral-700"
                viewBox="0 0 32 16"
                fill="none"
              >
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
      <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No on-chain link, no shared address, no Provah-stored mapping between A and B. The
        capability itself is the only thing that crosses between them.
      </p>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white dark:bg-neutral-950">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center sm:pt-28">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-neutral-900 sm:text-6xl dark:text-neutral-50">
          Private eligibility,
          <span className="block text-indigo-600 dark:text-indigo-400">a capability anyone can redeem.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Provah checks something about a wallet&apos;s STRK20 activity, then issues a one-time
          capability you can hand to any wallet to redeem. Gas-sponsored, and nothing on-chain
          links the two.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href="#app"
            className="rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-neutral-900/10 transition-all duration-150 hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 active:scale-[0.97] dark:bg-white dark:text-neutral-900 dark:shadow-none dark:hover:bg-neutral-200"
          >
            Try it live
          </a>
          <a
            href="https://github.com/levithefirst/provah"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-neutral-300 bg-white px-7 py-3.5 text-sm font-semibold text-neutral-800 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-400 active:translate-y-0 active:scale-[0.97] dark:border-neutral-700 dark:bg-transparent dark:text-neutral-200 dark:hover:border-neutral-500"
          >
            View the code
          </a>
        </div>

        <div className="mt-16 w-full max-w-3xl rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-xl shadow-neutral-900/5 backdrop-blur sm:p-10 dark:border-neutral-800 dark:bg-neutral-900/60 dark:shadow-none">
          <HeroFlow />
        </div>
      </div>
    </section>
  );
}
