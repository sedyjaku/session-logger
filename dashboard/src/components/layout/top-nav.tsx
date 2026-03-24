"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/budget", label: "Budget" },
  { href: "/cost", label: "Cost" },
  { href: "/waste", label: "Waste" },
  { href: "/anomalies", label: "Anomalies" },
  { href: "/tools", label: "Tools" },
  { href: "/model-whatif", label: "Model What-If" },
  { href: "/insights", label: "Insights" },
  { href: "/sessions", label: "Sessions" },
  { href: "/labels", label: "Labels" },
  { href: "/models", label: "Models" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center px-6">
        <Link href="/" className="mr-8 flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">Session Logger</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--muted)] text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
