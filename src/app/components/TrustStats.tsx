const STATS = [
  { value: "7", label: "Confirmed mainnet transactions" },
  { value: "3", label: "Live campaigns, 3 predicate types" },
  { value: "1", label: "Contract, zero redeploys between them" },
];

export default function TrustStats() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="rounded-3xl border border-neutral-200 bg-neutral-900 px-8 py-14 text-white sm:px-14">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-neutral-300">
              Built on Starknet · STRK20 Private Sprint
            </span>
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Real mainnet activity, not a testnet screenshot
            </h2>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-4xl font-semibold text-white sm:text-5xl">{s.value}</div>
                <div className="mt-2 text-sm text-neutral-400">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-center">
            <p className="max-w-xl text-sm text-neutral-400">
              Contract{" "}
              <a
                className="font-mono text-neutral-200 underline underline-offset-2"
                href="https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402"
                target="_blank"
                rel="noreferrer"
              >
                0x7461…b402
              </a>{" "}
              — see{" "}
              <a
                className="underline underline-offset-2"
                href="https://github.com/levithefirst/provah/blob/main/strk20.json"
                target="_blank"
                rel="noreferrer"
              >
                strk20.json
              </a>{" "}
              for the full, machine-readable list.
            </p>
            <p className="max-w-xl text-xs text-neutral-500">
              Honest note: the predicate check itself is a signed server attestation today, not a
              client-side ZK proof — the mainnet proving service the fully trustless version needs
              has no published endpoint. See{" "}
              <a
                className="underline underline-offset-2"
                href="https://github.com/levithefirst/provah#the-attester-today-and-what-replaces-it"
                target="_blank"
                rel="noreferrer"
              >
                &quot;The attester today&quot;
              </a>{" "}
              for the on-chain proof of why, and exactly what changes when it&apos;s reachable.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
