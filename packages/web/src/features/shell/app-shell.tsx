import { HeaderBar } from "./header-bar.js";
import { WorkspaceSidebar } from "./workspace-sidebar.js";
import { SessionMain } from "../sessions/session-main.js";
import { GitChangesDrawer } from "./git-changes-drawer.js";
import { useUiStore } from "../../app/store/ui-store.js";
import { useAppInit } from "../../app/hooks/use-app-init.js";

export function AppShell() {
  useAppInit();
  const gitDrawerOpen = useUiStore((s) => s.gitDrawerOpen);

  return (
    <div className="flex h-full flex-col">
      <HeaderBar />
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="flex-shrink-0 overflow-y-auto bg-[var(--color-bg-secondary)]"
          style={{ width: "var(--layout-sidebar)" }}
        >
          <WorkspaceSidebar />
        </aside>
        <main className="flex-1 overflow-hidden bg-[var(--color-bg-primary)]">
          <SessionMain />
        </main>
        {gitDrawerOpen && (
          <aside
            className="flex-shrink-0 overflow-hidden bg-[var(--color-bg-secondary)]"
            style={{ width: "var(--layout-git-drawer)" }}
          >
            <GitChangesDrawer />
          </aside>
        )}
      </div>
    </div>
  );
}
