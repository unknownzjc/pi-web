import { create } from "zustand";

interface GitChangeItem {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked";
  isBinary?: boolean;
}

interface GitDiffData {
  path: string;
  isBinary: boolean;
  tooLarge: boolean;
  diffText?: string;
}

interface GitStore {
  changes: GitChangeItem[];
  selectedDiff: GitDiffData | null;
  changesLoading: boolean;
  diffLoading: boolean;

  setChanges: (items: GitChangeItem[]) => void;
  setSelectedDiff: (data: GitDiffData | null) => void;
  setChangesLoading: (v: boolean) => void;
  setDiffLoading: (v: boolean) => void;
  clear: () => void;
}

export const useGitStore = create<GitStore>((set) => ({
  changes: [],
  selectedDiff: null,
  changesLoading: false,
  diffLoading: false,

  setChanges: (items) => set({ changes: items }),
  setSelectedDiff: (data) => set({ selectedDiff: data }),
  setChangesLoading: (v) => set({ changesLoading: v }),
  setDiffLoading: (v) => set({ diffLoading: v }),
  clear: () => set({ changes: [], selectedDiff: null, changesLoading: false, diffLoading: false }),
}));

export type { GitChangeItem, GitDiffData };
