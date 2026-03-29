import { create } from "zustand";
import type { WorkspaceDto } from "../../types/dto.js";
import type { ConnectionStatus } from "../../types/view-model.js";

interface AppStore {
  workspaces: WorkspaceDto[];
  selectedWorkspaceId?: string;
  activeSessionHandle?: string;
  connectionStatus: ConnectionStatus;

  setWorkspaces: (workspaces: WorkspaceDto[]) => void;
  selectWorkspace: (id: string | undefined) => void;
  setActiveSession: (handle: string | undefined) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  workspaces: [],
  selectedWorkspaceId: undefined,
  activeSessionHandle: undefined,
  connectionStatus: "disconnected",

  setWorkspaces: (workspaces) => set({ workspaces }),
  selectWorkspace: (id) =>
    set({ selectedWorkspaceId: id, activeSessionHandle: undefined }),
  setActiveSession: (handle) => set({ activeSessionHandle: handle }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));
