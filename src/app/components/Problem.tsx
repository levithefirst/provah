import { Check, Lock, Ticket, X } from "lucide-react";

export default function Problem() {
  return (
    <section className="bg-neutral-50 py-24 dark:bg-neutral-900/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
            The problem
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-50">
            Private state, alone, doesn&apos;t do anything.
          </h2>
          <p className="mt-5 text-neutral-600 dark:text-neutral-400">
            STRK20 shields balances and transfers on Starknet. But privacy that only sits there
            isn&apos;t useful by itself. The moment you try to <em>act</em> on it (claim a reward,
            prove you qualify, unlock access) you either reveal the wallet behind it, or build a
            bespoke proof system for that one case. Neither approach scales past a single app.
          </p>
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">
            Provah is the layer in between: it turns a provable fact about a wallet&apos;s activity
            into a capability that acts on-chain, from a wallet with no relationship to the one
            that qualified for it.
          </p>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3 text-neutral-400 dark:text-neutral-600">
            <Lock className="h-6 w-6" strokeWidth={1.75} />
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
            <X className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-500 dark:text-neutral-500">
            Without Provah: acting on private state means revealing the wallet, or building a
            one-off proof system per app.
          </p>
          <div className="mt-8 flex items-center gap-3 text-accent-ink">
            <Lock className="h-6 w-6" strokeWidth={1.75} />
            <div className="h-px flex-1 bg-accent/50 dark:bg-accent/30" />
            <Ticket className="h-6 w-6" strokeWidth={1.75} />
            <div className="h-px flex-1 bg-accent/50 dark:bg-accent/30" />
            <Check className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            With Provah: the fact becomes a portable capability. Any wallet can redeem it, with
            zero on-chain link back to the source.
          </p>
        </div>
      </div>
    </section>
  );
}
