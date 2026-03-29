import { useEffect } from "react";
import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore, type SessionData } from "../../app/store/session-store.js";
import { useRequestStore } from "../../app/store/request-store.js";
import { fetchSessions } from "../../api/sessions.js";
import { SessionListItem } from "./session-list-item.js";

export function SessionList() {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const activeSessionHandle = useAppStore((s) => s.activeSessionHandle);
  const sessions = useSessionStore((s) => s.sessions);
  const loading = useRequestStore((s) => s.sessionListLoading);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    let cancelled = false;
    
    // 清空之前的 session 数据，避免显示其他 workspace 的历史记录
    useSessionStore.getState().clearSessions();
    
    useRequestStore.getState().set({ sessionListLoading: true });
    fetchSessions(selectedWorkspaceId)
      .then((result) => {
        if (cancelled) return;
        for (const s of result.items) {
          useSessionStore.getState().setSession(s.sessionHandle, { summary: s });
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to load sessions:", err);
      })
      .finally(() => {
        if (!cancelled) useRequestStore.getState().set({ sessionListLoading: false });
      });
    return () => { cancelled = true; };
  }, [selectedWorkspaceId]);

  const sessionList = Object.values(sessions)
    .filter((s): s is SessionData & { summary: NonNullable<SessionData["summary"]> } => s.summary != null)
    .sort((a, b) => new Date(b.summary.updatedAt).getTime() - new Date(a.summary.updatedAt).getTime());

  if (!selectedWorkspaceId) {
    return (
      <div className="px-3 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
        Select a workspace to view sessions
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 px-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)]" />
        ))}
      </div>
    );
  }

  if (sessionList.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
        No sessions yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1">
      {sessionList.map((s) => (
        <SessionListItem
          key={s.summary.sessionHandle}
          session={s.summary}
          active={s.summary.sessionHandle === activeSessionHandle}
          onClick={() => setActiveSession(s.summary.sessionHandle)}
        />
      ))}
    </div>
  );
}
