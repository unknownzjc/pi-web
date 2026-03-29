import { clsx } from "clsx";
import type { SessionSummaryDto } from "../../types/dto.js";

interface SessionListItemProps {
  session: SessionSummaryDto;
  active: boolean;
  onClick: () => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function SessionListItem({ session, active, onClick }: SessionListItemProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full flex-col gap-0.5 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors",
        active
          ? "bg-[var(--color-bg-active)] text-[var(--color-text-primary)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {session.sessionName ?? `Session ${session.sessionId.slice(0, 8)}`}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
          {relativeTime(session.updatedAt)}
        </span>
      </div>
      {session.lastMessagePreview && (
        <span className="truncate text-xs text-[var(--color-text-tertiary)]">
          {session.lastMessagePreview}
        </span>
      )}
    </button>
  );
}
