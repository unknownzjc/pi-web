import { useEffect } from "react";
import { useAppStore } from "../../app/store/app-store.js";
import { useUiStore } from "../../app/store/ui-store.js";
import { useGitStore } from "../../app/store/git-store.js";
import { fetchGitChanges, fetchGitDiff } from "../../api/git.js";
import { GitChangesToolbar } from "../git-changes/git-changes-toolbar.js";
import { GitFileTree } from "../git-changes/git-file-tree.js";
import { GitDiffPane } from "../git-changes/git-diff-pane.js";

export function GitChangesDrawer() {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectedGitPath = useUiStore((s) => s.selectedGitPath);
  const toggleGitDrawer = useUiStore((s) => s.toggleGitDrawer);
  const changes = useGitStore((s) => s.changes);
  const selectedDiff = useGitStore((s) => s.selectedDiff);
  const changesLoading = useGitStore((s) => s.changesLoading);
  const diffLoading = useGitStore((s) => s.diffLoading);

  // Load git changes when drawer opens with a selected workspace
  useEffect(() => {
    if (!selectedWorkspaceId) return;
    const store = useGitStore.getState();
    store.setChangesLoading(true);
    fetchGitChanges(selectedWorkspaceId)
      .then((data) => store.setChanges(data.items))
      .catch(console.error)
      .finally(() => store.setChangesLoading(false));
  }, [selectedWorkspaceId]);

  // Load diff when a file is selected
  useEffect(() => {
    if (!selectedWorkspaceId || !selectedGitPath) {
      useGitStore.getState().setSelectedDiff(null);
      return;
    }
    const store = useGitStore.getState();
    store.setDiffLoading(true);
    fetchGitDiff(selectedWorkspaceId, selectedGitPath)
      .then((data) => store.setSelectedDiff(data))
      .catch(console.error)
      .finally(() => store.setDiffLoading(false));
  }, [selectedWorkspaceId, selectedGitPath]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
      <GitChangesToolbar
        count={changes.length}
        onClose={toggleGitDrawer}
      />

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        {changesLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-[var(--color-text-tertiary)]">
            Loading changes...
          </div>
        ) : (
          <GitFileTree
            items={changes}
            selectedPath={selectedGitPath}
            onSelect={(path) => useUiStore.getState().setSelectedGitPath(path)}
          />
        )}
      </div>

      {/* Diff pane */}
      <div className="flex flex-col border-t border-[var(--color-border-subtle)]">
        <GitDiffPane diff={selectedDiff} loading={diffLoading} />
      </div>
    </div>
  );
}
