import type { LucideIcon } from "lucide-react";
import { Card } from "../ui/card";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="metric-card min-w-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {Icon && (
          <Icon
            size={18}
            className="shrink-0 text-accent-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <p className="metric-value mt-5 break-words text-3xl font-semibold">
        {value}
      </p>
      {detail && <p className="mt-3 text-xs text-muted">{detail}</p>}
    </Card>
  );
}
