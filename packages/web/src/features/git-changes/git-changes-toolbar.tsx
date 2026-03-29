interface GitChangesToolbarProps {
  count: number;
  onClose: () => void;
}

export function GitChangesToolbar({ count, onClose }: GitChangesToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Changes
        </span>
        {count > 0 && (
          <span className="rounded-full bg-[var(--color-bg-active)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
            {count}
          </span>
        )}
      </div>
      <button
        onClick={onClose}
        className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
