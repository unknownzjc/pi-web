import { Outlet } from "react-router-dom";
import { useUrlSync } from "../hooks/use-url-sync.js";

export function UrlSyncShell() {
  useUrlSync();
  return <Outlet />;
}
