export default function FinalCta() {
  return (
    <section className="bg-neutral-50 py-24 dark:bg-neutral-900/40">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-50">
          Private eligibility in. Portable capability out.
        </h2>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          Consumed exactly once, from anywhere. Try the whole flow yourself: it takes under two
          minutes and it&apos;s real mainnet, not a testnet fork.
        </p>
        <a
          href="#app"
          className="mt-8 inline-block rounded-full bg-accent px-8 py-4 text-sm font-semibold text-neutral-900 shadow-lg shadow-accent/20 transition-all duration-150 hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 active:scale-[0.97]"
        >
          Try the live demo
        </a>
      </div>
    </section>
  );
}
