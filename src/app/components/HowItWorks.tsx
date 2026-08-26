const STEPS = [
  {
    n: "01",
    title: "Prove it",
    body: "Connect the wallet with the STRK20 activity that matters. Provah checks a rule (held for N days, above a threshold, deposit count) against public pool data. Your private note state is never touched.",
  },
  {
    n: "02",
    title: "Get a capability",
    body: "Provah signs a one-time capability bound to a fresh nullifier and hands it to you as a bearer token, not to your wallet. It carries no wallet binding until someone redeems it.",
  },
  {
    n: "03",
    title: "Redeem anywhere",
    body: "Hand the token to any wallet: brand new, unfunded, or someone else entirely. They claim it, gas-sponsored. The chain records only campaign, nullifier, and recipient, nothing about you.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-24 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            How it works
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-50">
            One primitive, three steps
          </h2>
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">
            The same flow works for any rule you can evaluate against public chain data. This is a
            capability layer, not a single campaign.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-3xl border border-neutral-200 bg-neutral-50 p-8 transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:shadow-none"
            >
              <span className="text-sm font-semibold text-indigo-400 dark:text-indigo-500">{s.n}</span>
              <h3 className="mt-3 text-xl font-semibold text-neutral-900 dark:text-neutral-50">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-indigo-100 bg-indigo-50 px-6 py-5 text-center text-sm font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
          No on-chain link, ever: the capability is the only thing that crosses between the
          qualifying wallet and the claiming wallet.
        </div>
      </div>
    </section>
  );
}
