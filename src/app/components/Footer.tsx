const LINKS = [
  { label: "GitHub", href: "https://github.com/levithefirst/provah" },
  { label: "Docs / README", href: "https://github.com/levithefirst/provah#readme" },
  { label: "Live demo", href: "#app" },
  {
    label: "Contract on Starkscan",
    href: "https://starkscan.co/contract/0x74614e0cd54af7e59987a5d74fdd028209feff01fc20eca2934fe80b94db402",
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight text-neutral-900">Prova Pass</div>
          <p className="mt-2 max-w-xs text-sm text-neutral-500">
            A capability layer for private STRK20 state. Built for the STRK20 Private Sprint.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-4">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noreferrer" : undefined}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-6xl border-t border-neutral-200 px-6 pt-6 text-xs text-neutral-500">
        MIT License · Vendored StarkWare packages remain Apache-2.0.
      </div>
    </footer>
  );
}
