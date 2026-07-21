import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { WaitingForData } from "@/components/shared/async-states";

/**
 * Every nav destination resolves to a real screen. Secondary surfaces that are
 * scaffolded (header + data contract in place, presentation pending) render
 * through here so nothing is a dead link and nothing shows fabricated data.
 */
export function ScaffoldPage({
  title,
  subtitle,
  dataLabel,
  actions,
}: {
  title: string;
  subtitle?: string;
  dataLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <WaitingForData label={dataLabel ?? title} />
    </div>
  );
}
