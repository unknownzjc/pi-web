import { apiFetch } from "./transport.js";

export interface HealthData {
  status: string;
}

export function fetchHealth() {
  return apiFetch<HealthData>("/api/health");
}
