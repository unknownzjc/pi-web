import { Routes, Route } from "react-router-dom";
import { AppShell } from "../../features/shell/app-shell.js";
import { UrlSyncShell } from "./url-sync-shell.js";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<UrlSyncShell />}>
        <Route index element={<AppShell />} />
        <Route path="workspace/:workspaceId" element={<AppShell />} />
        <Route path="workspace/:workspaceId/session/:sessionHandle" element={<AppShell />} />
        <Route path="*" element={<AppShell />} />
      </Route>
    </Routes>
  );
}
