import { useState } from "react";
import { Icon } from "../../components/ui/icon.js";
import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore } from "../../app/store/session-store.js";
import { useRequestStore } from "../../app/store/request-store.js";
import { createOrResumeSession } from "../../api/sessions.js";
import { SessionList } from "../workspaces/session-list.js";
import { AddWorkspaceDialog } from "../workspaces/add-workspace-dialog.js";

export function WorkspaceSidebar() {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const promptSending = useRequestStore((s) => s.promptSending);

  const handleNewSession = async () => {
    if (!selectedWorkspaceId) return;
    try {
      useRequestStore.getState().set({ promptSending: true });
      const result = await createOrResumeSession({
        workspaceId: selectedWorkspaceId,
      });
      const session = result.session;
      useAppStore.getState().setActiveSession(session.sessionHandle);
      useSessionStore.getState().setSession(session.sessionHandle, {
        summary: session,
      });
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      useRequestStore.getState().set({ promptSending: false });
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-secondary)]">
      {/* Sessions header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Sessions
        </span>
        <div className="flex items-center gap-1">
          {selectedWorkspaceId && (
            <button
              onClick={handleNewSession}
              disabled={promptSending}
              className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
              title="New Session"
            >
              <Icon name="plus" size={14} />
            </button>
          )}
          <button
            onClick={() => setAddDialogOpen(true)}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            title="Add Workspace"
          >
            <Icon name="folder" size={14} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        <SessionList />
      </div>

      {/* Add workspace dialog */}
      <AddWorkspaceDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />
    </div>
  );
}
