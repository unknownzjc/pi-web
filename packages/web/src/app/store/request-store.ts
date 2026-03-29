import { create } from "zustand";

interface RequestStore {
  addWorkspacePending: boolean;
  sessionListLoading: boolean;
  sessionStateLoading: boolean;
  historyLoading: boolean;
  promptSending: boolean;
  promptError?: string;
  abortPending: boolean;

  set: (patch: Partial<RequestStore>) => void;
}

export const useRequestStore = create<RequestStore>((set) => ({
  addWorkspacePending: false,
  sessionListLoading: false,
  sessionStateLoading: false,
  historyLoading: false,
  promptSending: false,
  promptError: undefined,
  abortPending: false,

  set: (patch) => set(patch),
}));
