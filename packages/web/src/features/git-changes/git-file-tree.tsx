import { clsx } from "clsx";
import { Icon } from "../../components/ui/icon.js";
import type { GitChangeItem } from "../../app/store/git-store.js";

const statusConfig: Record<string, { label: string; color: string }> = {
  modified: { label: "M", color: "bg-amber-500/80 text-amber-950" },
  added: { label: "A", color: "bg-emerald-500/80 text-emerald-950" },
  deleted: { label: "D", color: "bg-red-500/80 text-red-950" },
  untracked: { label: "?", color: "bg-zinc-500/60 text-zinc-300" },
};

interface GitFileTreeProps {
  items: GitChangeItem[];
  selectedPath?: string;
  onSelect: (path: string) => void;
}

export function GitFileTree({ items, selectedPath, onSelect }: GitFileTreeProps) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
        No changes detected
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px px-2 py-1">
      {items.map((item) => {
        const cfg = statusConfig[item.status] ?? statusConfig.untracked;
        const fileName = item.path.split("/").pop() ?? item.path;
        const dir = item.path.split("/").slice(0, -1).join("/");
        const isSelected = item.path === selectedPath;

        return (
          <button
            key={item.path}
            onClick={() => onSelect(item.path)}
            className={clsx(
              "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors",
              isSelected
                ? "bg-[var(--color-bg-active)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
            )}
          >
            <Icon
              name={item.status === "deleted" ? "file" : "file"}
              size={14}
              className="shrink-0 text-[var(--color-text-tertiary)]"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs">{fileName}</span>
              {dir && (
                <span className="truncate text-[10px] text-[var(--color-text-tertiary)]">
                  {dir}
                </span>
              )}
            </div>
            <span
              className={clsx(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                cfg.color,
              )}
            >
              {cfg.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
