import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/app-store.js";

/**
 * Bidirectional sync between URL params and app store.
 *
 * URL → Store: reads :workspaceId and :sessionHandle from the current URL and
 *              applies them to the store on mount / param change.
 *
 * Store → URL: subscribes to store changes and updates the URL so that it
 *              always reflects the current selection (replace, no history noise).
 */
export function useUrlSync() {
  const { workspaceId, sessionHandle } = useParams<{
    workspaceId: string;
    sessionHandle: string;
  }>();
  const navigate = useNavigate();
  const initialSyncDone = useRef(false);

  // URL → Store (on mount / param change)
  useEffect(() => {
    const { selectedWorkspaceId, activeSessionHandle, selectWorkspace, setActiveSession } =
      useAppStore.getState();

    if (workspaceId && workspaceId !== selectedWorkspaceId) {
      selectWorkspace(workspaceId);
      if (sessionHandle) {
        useAppStore.getState().setActiveSession(sessionHandle);
      }
    } else if (sessionHandle && sessionHandle !== activeSessionHandle) {
      setActiveSession(sessionHandle);
    }
    initialSyncDone.current = true;
  }, [workspaceId, sessionHandle]);

  // Store → URL
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      if (!initialSyncDone.current) return;

      const { selectedWorkspaceId: wid, activeSessionHandle: sh } = state;
      let path = "/";
      if (wid) {
        path = `/workspace/${wid}`;
        if (sh) {
          path += `/session/${sh}`;
        }
      }
      if (window.location.pathname !== path) {
        navigate(path, { replace: true });
      }
    });
    return unsub;
  }, [navigate]);
}
