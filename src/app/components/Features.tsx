const FEATURES = [
  {
    icon: "🧩",
    title: "Multi-predicate support",
    body: "held_since, balance_threshold, deposit_count: pluggable predicate types, all against the same deployed contract, zero redeploys.",
  },
  {
    icon: "🔀",
    title: "Cross-wallet claims",
    body: "Generate from one wallet, claim from a completely different one, funded or brand new, by design.",
  },
  {
    icon: "🎟️",
    title: "Transferable bearer passes",
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
    body: "The claiming wallet needs zero STRK. Prova's operating account relays the transaction.",
  },
  {
    icon: "🔍",
    title: "Honest trust boundary",
    body: "The predicate check is a signed attestation today, not yet a client-side ZK proof, and we say exactly why, with on-chain evidence.",
  },
];

export default function Features() {
  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Features
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Built as a primitive, not a demo
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="mt-4 font-semibold text-neutral-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
