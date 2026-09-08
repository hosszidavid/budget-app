export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`wallet-mark ${compact ? "compact" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 40 40" role="img">
      <rect x="6.5" y="10" width="27" height="21" rx="6.5" className="wallet-body" />
      <path d="M9.5 13.5h20.2a3.8 3.8 0 0 1 3.8 3.8v2.1H25a5.6 5.6 0 0 0 0 11.2h8.5" className="wallet-line" />
      <path d="M10.2 10.2 25.7 6.8a4 4 0 0 1 4.8 3.2" className="wallet-line" />
      <circle cx="26" cy="25" r="1.8" className="wallet-dot" />
    </svg>
  </span>;
}
