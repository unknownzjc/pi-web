import { useState, useEffect, useCallback } from "react";
import { registerWorkspace, fetchWorkspaces } from "../../api/workspaces.js";
import { browseFilesystem, type BrowseResult } from "../../api/filesystem.js";
import { useAppStore } from "../../app/store/app-store.js";
import { useRequestStore } from "../../app/store/request-store.js";
import { Icon } from "../../components/ui/icon.js";

interface AddWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddWorkspaceDialog({ open, onClose }: AddWorkspaceDialogProps) {
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRequestStore((s) => s.addWorkspacePending);
  const setWorkspaces = useAppStore((s) => s.setWorkspaces);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);

  const navigate = useCallback((path?: string) => {
    setLoading(true);
    setError(null);
    browseFilesystem(path)
      .then((result) => {
        setBrowseResult(result);
        setCurrentPath(result.path);
        setFilter("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to browse");
      })
      .finally(() => setLoading(false));
  }, []);

  // Load home directory when dialog opens
  useEffect(() => {
    if (open) {
      navigate();
      setName("");
      setError(null);
      setFilter("");
    }
  }, [open, navigate]);

  if (!open) return null;

  const filtered = browseResult
    ? filter
      ? browseResult.entries.filter((e) =>
          e.name.toLowerCase().includes(filter.toLowerCase()),
        )
      : browseResult.entries
    : [];

  // Build breadcrumb segments from currentPath
  const segments = currentPath
    .split("/")
    .filter(Boolean)
    .reduce<Array<{ label: string; path: string }>>((acc, seg, i) => {
      const fullPath = "/" + currentPath.split("/").filter(Boolean).slice(0, i + 1).join("/");
      acc.push({ label: seg, path: fullPath });
      return acc;
    }, []);

  const handleRegister = async () => {
    useRequestStore.getState().set({ addWorkspacePending: true });
    setError(null);
    try {
      const ws = await registerWorkspace({
        path: currentPath,
        name: name.trim() || undefined,
      });
      const list = await fetchWorkspaces();
      setWorkspaces(list);
      selectWorkspace(ws.workspaceId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register workspace");
    } finally {
      useRequestStore.getState().set({ addWorkspacePending: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Register Workspace
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-4 py-2 text-xs">
          {browseResult?.parentPath != null && (
            <button
              onClick={() => navigate(browseResult.parentPath!)}
              className="flex-shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              title="Go up"
            >
              <Icon name="arrow-left" size={14} />
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
          >
            /
          </button>
          {segments.map((seg, i) => (
            <span key={seg.path} className="flex items-center gap-1">
              <span className="text-[var(--color-text-tertiary)]">/</span>
              <button
                onClick={() => navigate(seg.path)}
                className={clsxBreadcrumb(
                  i === segments.length - 1,
                )}
              >
                {seg.label}
              </button>
            </span>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <Icon name="search" size={14} className="flex-shrink-0 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter directories..."
            className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          />
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-[var(--color-text-tertiary)]">
              <Icon name="loading" size={14} className="mr-2" />
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--color-text-tertiary)]">
              {filter ? "No matching directories" : "Empty directory"}
            </div>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.path}
                onClick={() => navigate(entry.path)}
                className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <Icon name="folder" size={14} className="flex-shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer: name + actions */}
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {error && (
            <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-sm)] bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <Icon name="x" size={12} />
              {error}
            </div>
          )}
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              Display Name{" "}
              <span className="text-[var(--color-text-tertiary)]">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full rounded-[var(--radius-sm)] border-none bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="max-w-[200px] truncate text-xs text-[var(--color-text-tertiary)]" title={currentPath}>
              {currentPath}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={pending || !currentPath}
                className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
              >
                {pending ? "Registering..." : "Select & Register"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clsxBreadcrumb(isLast: boolean) {
  return isLast
    ? "rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--color-text-primary)] font-medium"
    : "rounded-[var(--radius-sm)] px-1 py-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]";
}
