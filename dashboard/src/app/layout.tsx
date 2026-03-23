import type { Metadata } from "next";
import { Suspense } from "react";
import { TopNav } from "@/components/layout/top-nav";
import { FilterBar } from "@/components/filters/filter-bar";
import { getAllLabels, getAllProjects, getAllModels } from "@/lib/queries";
import "./globals.css";

export const metadata: Metadata = {
  title: "Session Logger Dashboard",
  description: "Claude Code usage analytics",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let labels: string[] = [];
  let projects: string[] = [];
  let models: string[] = [];

  try {
    labels = getAllLabels();
    projects = getAllProjects();
    models = getAllModels();
  } catch {
    // DB not available yet
  }

  return (
    <html lang="en">
      <body>
        <TopNav />
        <Suspense>
          <FilterBar labels={labels} projects={projects} models={models} />
        </Suspense>
        <main className="mx-auto max-w-screen-2xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
