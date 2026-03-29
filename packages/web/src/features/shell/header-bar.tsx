import { useState } from "react";
import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore } from "../../app/store/session-store.js";
import { useUiStore } from "../../app/store/ui-store.js";
import { ConnectionDot } from "../../components/feedback/connection-dot.js";
import { StreamingIndicator } from "../../components/feedback/streaming-indicator.js";
import { Icon } from "../../components/ui/icon.js";
import { AddWorkspaceDialog } from "../workspaces/add-workspace-dialog.js";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher.js";

export function HeaderBar() {
  const activeHandle = useAppStore((s) => s.activeSessionHandle);
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const toggleGitDrawer = useUiStore((s) => s.toggleGitDrawer);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const sessionState = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle]?.state : undefined),
  );
  const sessionSummary = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle]?.summary : undefined),
  );

  const sessionTitle = sessionSummary?.sessionName ?? (activeHandle ? "Session" : null);
  const isStreaming = sessionState?.isStreaming ?? false;
  const modelName = sessionState?.model?.displayName;

  return (
    <>
    <header className="flex h-[var(--layout-header)] flex-shrink-0 items-center gap-3 bg-[var(--color-bg-secondary)] px-4">
      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-bold text-white">
          P
        </div>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">Pi</span>
      </div>

      <div className="h-4 w-px bg-[var(--color-border)]" />

      {/* Workspace switcher */}
      <WorkspaceSwitcher onAddNew={() => setAddDialogOpen(true)} />

      {/* Session title */}
      {sessionTitle && (
        <>
          <div className="h-4 w-px bg-[var(--color-border)]" />
          <span className="truncate text-sm text-[var(--color-text-secondary)]">
            {sessionTitle}
          </span>
        </>
      )}

      {/* Model badge */}
      {modelName && (
        <>
          <div className="h-4 w-px bg-[var(--color-border)]" />
          <span className="inline-flex items-center rounded-full bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
            {modelName}
          </span>
        </>
      )}

      {/* Runtime badge */}
      <span className="inline-flex items-center rounded-full bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
        Local
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Agent streaming status */}
      {isStreaming && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-accent-text)]">
          <StreamingIndicator />
          <span>Streaming</span>
        </div>
      )}

      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <ConnectionDot status={connectionStatus} />
        <span className="text-[11px] text-[var(--color-text-tertiary)] capitalize">
          {connectionStatus}
        </span>
      </div>

      {/* Git toggle */}
      <button
        onClick={toggleGitDrawer}
        className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
        title="Toggle Git Changes"
      >
        <Icon name="git-branch" size={16} />
      </button>
    </header>
      <AddWorkspaceDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
    </>
  );
}
