const PATHS = [
  {
    tag: "No deposit needed",
    title: "Path 1 — try it in 2 minutes",
    steps: [
      'Select "Capability Smoke Test" in the campaign picker below',
      "Connect any Wallet A (even brand new) — generate pass",
      "Connect any Wallet B (even empty) — claim, gas-sponsored",
      "Verify on-chain",
    ],
  },
  {
    tag: "Real STRK20 eligibility",
    title: "Path 2 — the real predicate, optional reward",
    steps: [
      "Shield some STRK once, in Ready or Braavos, into the live pool",
      'Come back and select a real campaign (e.g. "STRK Welcome Reward")',
      "Same generate → claim → verify flow — the reward campaign also pays real STRK",
    ],
  },
];

export default function HowToUse() {
  return (
    <div className="mb-10 grid gap-4 sm:grid-cols-2">
      {PATHS.map((p) => (
        <div
          key={p.title}
          className="rounded-2xl border border-neutral-200 bg-white p-5 text-left dark:border-neutral-800 dark:bg-neutral-900/40"
        >
          <span className="inline-block rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-ink">
            {p.tag}
          </span>
          <h3 className="mt-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{p.title}</h3>
          <ol className="mt-2 flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            {p.steps.map((s, i) => (
              <li key={i}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
