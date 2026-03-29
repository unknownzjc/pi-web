import { apiFetch } from "./transport.js";
import type {
  SessionSummaryDto,
  SessionStateDto,
  SessionMessagesPageDto,
} from "../types/dto.js";

export function fetchSessions(
  workspaceId: string,
  cursor?: string,
  limit = 50,
) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return apiFetch<{ items: SessionSummaryDto[]; nextCursor?: string }>(
    `/api/workspaces/${workspaceId}/sessions?${params}`,
  );
}

export function createOrResumeSession(input: {
  workspaceId: string;
  sessionHandle?: string;
  name?: string;
}) {
  return apiFetch<{ session: SessionSummaryDto }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchSessionState(sessionHandle: string) {
  return apiFetch<SessionStateDto>(
    `/api/sessions/${encodeURIComponent(sessionHandle)}/state`,
  );
}

export function fetchSessionMessages(
  sessionHandle: string,
  beforeEntryId?: string,
  limit = 100,
) {
  const params = new URLSearchParams();
  if (beforeEntryId) params.set("beforeEntryId", beforeEntryId);
  params.set("limit", String(limit));
  return apiFetch<SessionMessagesPageDto>(
    `/api/sessions/${encodeURIComponent(sessionHandle)}/messages?${params}`,
  );
}

export function abortSession(sessionHandle: string) {
  return apiFetch<void>(
    `/api/sessions/${encodeURIComponent(sessionHandle)}/abort`,
    { method: "POST" },
  );
}
