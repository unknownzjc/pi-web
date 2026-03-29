import { clsx } from "clsx";
import type { ConnectionStatus } from "../../types/view-model.js";

const statusConfig: Record<ConnectionStatus, { color: string; pulse: boolean }> = {
  connected: { color: "bg-[var(--color-success)]", pulse: false },
  connecting: { color: "bg-[var(--color-warning)]", pulse: true },
  disconnected: { color: "bg-[var(--color-error)]", pulse: false },
  hydrating: { color: "bg-[var(--color-warning)]", pulse: true },
};

interface ConnectionDotProps {
  status: ConnectionStatus;
  className?: string;
}

export function ConnectionDot({ status, className }: ConnectionDotProps) {
  const config = statusConfig[status];
  return (
    <span
      className={clsx(
        "inline-block h-2 w-2 rounded-full",
        config.color,
        config.pulse && "animate-pulse",
        className,
      )}
    />
  );
}
