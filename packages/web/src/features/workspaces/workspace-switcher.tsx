import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { Icon } from "../../components/ui/icon.js";
import { useAppStore } from "../../app/store/app-store.js";

interface WorkspaceSwitcherProps {
  onAddNew?: () => void;
}

export function WorkspaceSwitcher({ onAddNew }: WorkspaceSwitcherProps) {
  const workspaces = useAppStore((s) => s.workspaces);
  const selectedId = useAppStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = workspaces.find((w) => w.workspaceId === selectedId);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Focus the search input after the dropdown renders
    requestAnimationFrame(() => inputRef.current?.focus());
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = query
    ? workspaces.filter((ws) => {
        const q = query.toLowerCase();
        return (
          (ws.name && ws.name.toLowerCase().includes(q)) ||
          ws.path.toLowerCase().includes(q)
        );
      })
    : workspaces;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <span className="truncate max-w-[180px]">
          {selected
            ? (selected.name ?? selected.path.split("/").pop() ?? selected.path)
            : "Select workspace"}
        </span>
        <Icon name="chevron-down" size={12} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] shadow-xl border border-[var(--color-border)]"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <Icon name="search" size={14} className="text-[var(--color-text-tertiary)] flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspaces..."
              className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
          </div>

          {/* Workspace list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
                {query ? "No matching workspaces" : "No workspaces registered"}
              </div>
            ) : (
              filtered.map((ws) => (
                <button
                  key={ws.workspaceId}
                  onClick={() => {
                    selectWorkspace(ws.workspaceId);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                    ws.workspaceId === selectedId
                      ? "bg-[var(--color-bg-active)] text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
                  )}
                >
                  <Icon name="folder" size={14} />
                  <span className="truncate">{ws.name ?? ws.path}</span>
                  {ws.isGitRepo && (
                    <Icon
                      name="git-branch"
                      size={12}
                      className="ml-auto text-[var(--color-text-tertiary)]"
                    />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Register new workspace */}
          {onAddNew && (
            <div className="border-t border-[var(--color-border)]">
              <button
                onClick={() => {
                  setOpen(false);
                  onAddNew();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <Icon name="plus" size={14} />
                <span>Register new workspace</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
