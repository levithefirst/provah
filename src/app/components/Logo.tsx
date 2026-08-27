/**
 * Provah's mark: a solid geometric "P" flag, no counter/hole — legible at
 * favicon size, where fine detail disappears first. Rendered as a lime
 * shape on a charcoal badge so one asset works unchanged on both the light
 * and dark themes; the badge, not the page, carries the contrast.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="#131313" />
      <path
        d="M10 6.5C10 6.22386 10.2239 6 10.5 6H15C17.4853 6 19.5 8.01472 19.5 10.5C19.5 12.9853 17.4853 15 15 15H12.5V21C12.5 21.2761 12.2761 21.5 12 21.5H10.5C10.2239 21.5 10 21.2761 10 21V6.5Z"
        fill="#B7F34A"
      />
      <path d="M12.5 9H15C15.8284 9 16.5 9.67157 16.5 10.5C16.5 11.3284 15.8284 12 15 12H12.5V9Z" fill="#131313" />
    </svg>
  );
}

export default function Logo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-tight">Provah</span>
    </span>
  );
}
