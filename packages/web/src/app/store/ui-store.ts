import { create } from "zustand";
import type { FrontendUiState } from "../../types/view-model.js";

interface UiStore extends FrontendUiState {
  toggleGitDrawer: () => void;
  setSelectedGitPath: (path: string | undefined) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  gitDrawerOpen: false,
  selectedGitPath: undefined,

  toggleGitDrawer: () =>
    set((state) => ({ gitDrawerOpen: !state.gitDrawerOpen })),
  setSelectedGitPath: (path) => set({ selectedGitPath: path }),
}));
