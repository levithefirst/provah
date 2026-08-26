const FEATURES = [
  {
    icon: "🧩",
    title: "Multiple rule types",
    body: "Held for N days, above a threshold, or deposit count: pluggable rules against the same deployed contract, zero redeploys.",
  },
  {
    icon: "🔀",
    title: "Cross-wallet claims",
    body: "Generate from one wallet, claim from a completely different one, funded or brand new, by design.",
  },
  {
    icon: "🎟️",
    title: "Transferable capabilities",
    body: "A pass is a literal token: copy it, DM it, put it in a QR code. Redeemable by anyone, from anywhere.",
  },
  {
    icon: "🔑",
    title: "One-time nullifiers",
    body: "Every pass consumes a fresh nullifier on-chain. Reuse is provably impossible: verify it yourself with is_nullifier_consumed.",
  },
  {
    icon: "⛽",
    title: "Gas-sponsored claims",
    body: "The claiming wallet needs zero STRK. Provah's operating account relays the transaction.",
  },
  {
    icon: "🔍",
    title: "Honest trust boundary",
    body: "The rule is checked by a signed attestation today, not yet a client-side ZK proof, and we say exactly why, with on-chain evidence.",
  },
];

export default function Features() {
  return (
    <section className="bg-neutral-50 py-24 dark:bg-neutral-900/40">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Features
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-50">
            Built as a primitive, not a demo
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-none dark:hover:border-neutral-700"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="mt-4 font-semibold text-neutral-900 dark:text-neutral-50">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
