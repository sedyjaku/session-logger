export function formatCost(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(2)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatActiveTime(activeSeconds: number | null): string {
  if (activeSeconds === null || activeSeconds === 0) return "";
  const rounded = Math.round(activeSeconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatPercent(ratio: number): string {
  if (isNaN(ratio) || !isFinite(ratio)) return "0%";
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatDelta(current: number, previous: number): { value: string; positive: boolean } {
  if (previous === 0) return { value: "N/A", positive: true };
  const delta = ((current - previous) / previous) * 100;
  return {
    value: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
    positive: delta <= 0,
  };
}

export function shortSessionId(id: string): string {
  return id.substring(0, 12);
}

export function shortProjectPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function formatRelativeDate(iso: string): string {
  if (!iso) return "-";
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "-";
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${weeks}w ago`;
  return `${months}mo ago`;
}
