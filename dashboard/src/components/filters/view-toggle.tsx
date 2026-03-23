"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface ViewToggleProps {
  options: string[];
  current: string;
}

export function ViewToggle({ options, current }: ViewToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateView = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === options[0]) {
        params.delete("view");
      } else {
        params.set("view", value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, options]
  );

  return (
    <div className="flex items-center gap-1 rounded-lg bg-[var(--muted)] p-0.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => updateView(option)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            current === option
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
