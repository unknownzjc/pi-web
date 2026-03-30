import { useEffect, useRef, useCallback, useMemo } from "react";
import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore } from "../../app/store/session-store.js";
import { useRequestStore } from "../../app/store/request-store.js";
import { fetchSessionMessages } from "../../api/sessions.js";
import { UserMessage, TimelineMessage } from "./message-item.js";
import { StreamingSpinner } from "./streaming-spinner.js";
import type { SessionMessageDto } from "../../types/dto.js";

/* ──────────────────────────────────────────────────────────────────────────
 * Turn grouping
 * ────────────────────────────────────────────────────────────────────────── */

interface Turn {
  userMessage?: SessionMessageDto;
  responses: SessionMessageDto[];
}

function groupIntoTurns(messages: SessionMessageDto[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (current) turns.push(current);
      current = { userMessage: msg, responses: [] };
    } else {
      if (!current) current = { responses: [] };
      current.responses.push(msg);
    }
  }
  if (current) turns.push(current);
  return turns;
}

/* ──────────────────────────────────────────────────────────────────────────
 * MessageTimeline
 * ────────────────────────────────────────────────────────────────────────── */

export function MessageTimeline() {
  const activeHandle = useAppStore((s) => s.activeSessionHandle);
  const session = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle] : undefined),
  );
  const historyLoading = useRequestStore((s) => s.historyLoading);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const loadingHistoryRef = useRef(false);

  const messages = session?.messages ?? [];
  const streamingDraft = session?.streamingDraft;
  const toolDrafts = session?.toolDrafts;
  const nextBeforeEntryId = session?.nextBeforeEntryId;
  const isStreaming = session?.state?.isStreaming ?? false;

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  // --- Load initial messages ---
  useEffect(() => {
    if (!activeHandle) return;
    const current = useSessionStore.getState().sessions[activeHandle];
    if (current?.hasLoadedInitialPage) return;

    let cancelled = false;
    useRequestStore.getState().set({ historyLoading: true });

    fetchSessionMessages(activeHandle)
      .then((page) => {
        if (cancelled) return;
        // Deduplicate against any messages that arrived via WebSocket
        // before the REST response completed. REST is authoritative (includes
        // tool results that WS never delivers), so use it as the base.
        const existing = useSessionStore.getState().sessions[activeHandle]?.messages ?? [];
        const pageIds = new Set(page.items.map((m) => m.entryId));
        // Keep any WS-only messages (arrived after REST snapshot),
        // but drop optimistic user messages — REST has the real version.
        const wsOnly = existing.filter(
          (m) => !pageIds.has(m.entryId) && !m.entryId.startsWith("optimistic:"),
        );
        useSessionStore.getState().setSession(activeHandle, {
          messages: [...page.items, ...wsOnly],
          nextBeforeEntryId: page.nextBeforeEntryId,
          hasLoadedInitialPage: true,
        });
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) useRequestStore.getState().set({ historyLoading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [activeHandle]);

  // --- Re-fetch messages when streaming ends to pick up tool results ---
  const prevIsStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming && activeHandle) {
      fetchSessionMessages(activeHandle)
        .then((page) => {
          const existing = useSessionStore.getState().sessions[activeHandle]?.messages ?? [];
          const pageIds = new Set(page.items.map((m) => m.entryId));
          // Drop optimistic messages — REST has the authoritative versions
          const wsOnly = existing.filter(
            (m) => !pageIds.has(m.entryId) && !m.entryId.startsWith("optimistic:"),
          );
          useSessionStore.getState().setSession(activeHandle, {
            messages: [...page.items, ...wsOnly],
            nextBeforeEntryId: page.nextBeforeEntryId,
          });
        })
        .catch(console.error);
    }
  }, [isStreaming, activeHandle]);

  // --- Scroll position tracking ---
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  // --- Auto-scroll on new messages ---
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isAtBottomRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // --- Auto-scroll during streaming ---
  useEffect(() => {
    if (isAtBottomRef.current && streamingDraft?.text) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
      });
    }
  }, [streamingDraft?.text]);

  // --- Load older messages on scroll to top ---
  const handleScrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 50 || !activeHandle || !nextBeforeEntryId) return;
    // Prevent concurrent fetches from duplicating history
    if (loadingHistoryRef.current) return;
    loadingHistoryRef.current = true;

    useRequestStore.getState().set({ historyLoading: true });
    const prevHeight = el.scrollHeight;

    fetchSessionMessages(activeHandle, nextBeforeEntryId)
      .then((page) => {
        const store = useSessionStore.getState();
        const existing = store.sessions[activeHandle]?.messages ?? [];
        // Deduplicate: only prepend items not already in existing messages
        const existingIds = new Set(existing.map((m) => m.entryId));
        const newItems = page.items.filter((m) => !existingIds.has(m.entryId));
        useSessionStore.getState().setSession(activeHandle, {
          messages: [...newItems, ...existing],
          nextBeforeEntryId: page.nextBeforeEntryId,
        });
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      })
      .catch(console.error)
      .finally(() => {
        loadingHistoryRef.current = false;
        useRequestStore.getState().set({ historyLoading: false });
      });
  }, [activeHandle, nextBeforeEntryId]);

  const onScroll = useCallback(() => {
    handleScroll();
    handleScrollToTop();
  }, [handleScroll, handleScrollToTop]);

  // --- Determine if spinner should show ---
  const hasActiveDrafts =
    (toolDrafts && toolDrafts.length > 0) || !!streamingDraft?.text;
  const showSpinner = isStreaming && !hasActiveDrafts;

  // --- Compute whether a timeline item is the very last in the stream ---
  const draftToolMessages: SessionMessageDto[] = (toolDrafts ?? []).map(
    (tool) => ({
      entryId: `tool-${tool.toolCallId}`,
      timestamp: new Date().toISOString(),
      role: "toolResult" as const,
      content: tool.partialResult ? JSON.stringify(tool.partialResult) : undefined,
      meta: { toolName: tool.toolName, isError: false, toolArgs: tool.args },
    }),
  );

  const draftStreamingMessage: SessionMessageDto | null = streamingDraft
    ? {
        entryId: streamingDraft.streamingMessageId,
        timestamp: new Date().toISOString(),
        role: "assistant" as const,
        content: streamingDraft.text,
      }
    : null;

  // --- Empty state ---
  if (!activeHandle) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[var(--color-text-tertiary)]"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Select or create a session to begin
          </p>
        </div>
      </div>
    );
  }

  // Flatten all timeline-renderable items to compute isLastInTimeline
  const allTimelineItems: Array<{
    key: string;
    msg: SessionMessageDto;
    streaming?: boolean;
  }> = [];

  for (const turn of turns) {
    for (const msg of turn.responses) {
      allTimelineItems.push({ key: msg.entryId, msg });
    }
  }
  for (const dtm of draftToolMessages) {
    allTimelineItems.push({ key: dtm.entryId, msg: dtm, streaming: true });
  }
  if (draftStreamingMessage) {
    allTimelineItems.push({
      key: draftStreamingMessage.entryId,
      msg: draftStreamingMessage,
      streaming: true,
    });
  }

  const lastTimelineKey =
    !showSpinner && allTimelineItems.length > 0
      ? allTimelineItems[allTimelineItems.length - 1].key
      : null;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto overflow-x-hidden px-5 pt-5 pb-10"
    >
      {historyLoading && (
        <div className="mb-2 flex justify-center">
          <span className="text-xs text-[var(--color-text-tertiary)]">
            Loading history...
          </span>
        </div>
      )}

      <div className="flex max-w-[var(--layout-content-max)] flex-col">
        {turns.map((turn, turnIdx) => (
          <div
            key={turn.userMessage?.entryId ?? `turn-${turnIdx}`}
            className="flex flex-col"
          >
            {turn.userMessage && <UserMessage message={turn.userMessage} />}
            {turn.responses.map((msg) => (
              <TimelineMessage
                key={msg.entryId}
                message={msg}
                isLastInTimeline={msg.entryId === lastTimelineKey}
              />
            ))}
          </div>
        ))}

        {/* Tool drafts */}
        {draftToolMessages.map((msg) => (
          <TimelineMessage
            key={msg.entryId}
            message={msg}
            isStreaming
            isLastInTimeline={msg.entryId === lastTimelineKey}
          />
        ))}

        {/* Streaming assistant draft */}
        {draftStreamingMessage && (
          <TimelineMessage
            message={draftStreamingMessage}
            isStreaming
            isLastInTimeline={draftStreamingMessage.entryId === lastTimelineKey}
          />
        )}

        {/* Spinner */}
        {showSpinner && <StreamingSpinner />}
      </div>
    </div>
  );
}
