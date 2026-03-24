interface TrendIndicatorProps {
  recent: number;
  older: number;
}

export function TrendIndicator({ recent, older }: TrendIndicatorProps) {
  if (older === 0 && recent === 0) return <span className="text-[var(--muted-foreground)]">-</span>;
  if (older === 0) return <span className="text-emerald-500">&#9650;</span>;

  const ratio = recent / older;
  if (ratio > 1.2) return <span className="text-emerald-500" title={`${recent} recent vs ${older} older`}>&#9650;</span>;
  if (ratio < 0.8) return <span className="text-red-500" title={`${recent} recent vs ${older} older`}>&#9660;</span>;
  return <span className="text-[var(--muted-foreground)]" title={`${recent} recent vs ${older} older`}>&#9644;</span>;
}
