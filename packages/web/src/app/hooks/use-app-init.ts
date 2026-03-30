import { useEffect, useRef } from "react";
import { fetchWorkspaces } from "../../api/workspaces.js";
import { fetchSessionState, fetchSessionMessages } from "../../api/sessions.js";
import { useAppStore } from "../store/app-store.js";
import { useSessionStore } from "../store/session-store.js";
import { ws } from "../ws-instance.js";
import { routeWsEvent } from "../ws-event-router.js";

async function rehydrateActiveSession() {
  const { activeSessionHandle } = useAppStore.getState();
  if (!activeSessionHandle) return;

  try {
    const [state, page] = await Promise.all([
      fetchSessionState(activeSessionHandle),
      fetchSessionMessages(activeSessionHandle),
    ]);
    // Deduplicate: WS events may have already pushed messages into the store
    // while the REST rehydration was in flight
    const existing = useSessionStore.getState().sessions[activeSessionHandle]?.messages ?? [];
    const pageIds = new Set(page.items.map((m) => m.entryId));
    // Keep REST items as authoritative, append any WS-only items not in the REST page
    const wsOnly = existing.filter((m) => !pageIds.has(m.entryId));
    useSessionStore.getState().setSession(activeSessionHandle, {
      state,
      messages: [...page.items, ...wsOnly],
      nextBeforeEntryId: page.nextBeforeEntryId,
      hasLoadedInitialPage: true,
      streamingDraft: undefined,
      toolDrafts: [],
    });
  } catch (err) {
    console.error("Rehydrate failed:", err);
  }
}

const lifecycle = {
  onOpen: () => {
    useAppStore.getState().setConnectionStatus("connected");
  },
  onClose: () => {
    useAppStore.getState().setConnectionStatus("disconnected");
  },
  onReconnect: () => {
    useAppStore.getState().setConnectionStatus("hydrating");
    rehydrateActiveSession().finally(() => {
      useAppStore.getState().setConnectionStatus("connected");
    });
  },
};

export function useAppInit() {
  const workspacesLoaded = useRef(false);

  useEffect(() => {
    // Load workspaces once
    if (!workspacesLoaded.current) {
      workspacesLoaded.current = true;
      fetchWorkspaces()
        .then((workspaces) => {
          useAppStore.getState().setWorkspaces(workspaces);
          if (workspaces.length > 0 && !useAppStore.getState().selectedWorkspaceId) {
            useAppStore.getState().selectWorkspace(workspaces[0].workspaceId);
          }
        })
        .catch(console.error);
    }

    // Connect WebSocket
    useAppStore.getState().setConnectionStatus("connecting");
    ws.connect(
      (event) => {
        routeWsEvent(event as Parameters<typeof routeWsEvent>[0]);
      },
      lifecycle,
    );

    return () => {
      useAppStore.getState().setConnectionStatus("disconnected");
      ws.disconnect();
    };
  }, []);
}
