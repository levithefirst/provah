export default function Problem() {
  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            The problem
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Private state is a dead end, on its own.
          </h2>
          <p className="mt-5 text-neutral-600">
            STRK20 makes your Starknet holdings private: shielded balances, unlinkable transfers.
            But privacy that can only sit there isn&apos;t useful. The moment you try to{" "}
            <em>do</em> something with it, claim a reward, prove you qualify, unlock access, you
            either reveal the wallet that holds the balance, or build a bespoke proof system for
            that one use case. Neither scales past a single demo.
          </p>
          <p className="mt-4 text-neutral-600">
            Prova is the missing layer in between: a way to turn any provable fact about private
            state into a capability that acts on-chain, from a wallet that has no relationship to
            the one that qualified for it.
          </p>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 text-neutral-400">
            <span className="text-2xl">🔒</span>
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-2xl">❌</span>
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-500">
            Without Prova: acting on private state means revealing the wallet, or building a
            one-off proof system per app.
          </p>
          <div className="mt-8 flex items-center gap-3 text-indigo-500">
            <span className="text-2xl">🔒</span>
            <div className="h-px flex-1 bg-indigo-200" />
            <span className="text-2xl">🎫</span>
            <div className="h-px flex-1 bg-indigo-200" />
            <span className="text-2xl">✅</span>
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-700">
            With Prova: the fact becomes a portable capability. Any wallet can redeem it, with
            zero on-chain link back to the source.
          </p>
        </div>
      </div>
    </section>
  );
}
