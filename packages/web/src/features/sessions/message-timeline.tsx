import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore } from "../../app/store/session-store.js";
import { useRequestStore } from "../../app/store/request-store.js";
import { fetchSessionMessages } from "../../api/sessions.js";
import { MessageItem } from "./message-item.js";

export function MessageTimeline() {
  const activeHandle = useAppStore((s) => s.activeSessionHandle);
  const session = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle] : undefined),
  );
  const historyLoading = useRequestStore((s) => s.historyLoading);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isAtBottomRef = useRef(true);

  const messages = session?.messages ?? [];
  const streamingDraft = session?.streamingDraft;
  const toolDrafts = session?.toolDrafts;
  const nextBeforeEntryId = session?.nextBeforeEntryId;

  // Load initial messages
  useEffect(() => {
    if (!activeHandle) return;
    // Read from store to avoid triggering re-render loop:
    // if hasLoadedInitialPage is a dep, setting it in .then() causes cleanup
    // which sets cancelled=true before .finally() can reset historyLoading.
    const current = useSessionStore.getState().sessions[activeHandle];
    if (current?.hasLoadedInitialPage) return;

    let cancelled = false;
    useRequestStore.getState().set({ historyLoading: true });

    fetchSessionMessages(activeHandle)
      .then((page) => {
        if (cancelled) return;
        useSessionStore.getState().setSession(activeHandle, {
          messages: page.items,
          nextBeforeEntryId: page.nextBeforeEntryId,
          hasLoadedInitialPage: true,
        });
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) useRequestStore.getState().set({ historyLoading: false });
      });

    return () => { cancelled = true; };
  }, [activeHandle]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isAtBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Load older messages on scroll to top
  const handleScrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 50 || !activeHandle || !nextBeforeEntryId) return;

    useRequestStore.getState().set({ historyLoading: true });
    const prevHeight = el.scrollHeight;

    fetchSessionMessages(activeHandle, nextBeforeEntryId)
      .then((page) => {
        const store = useSessionStore.getState();
        const existing = store.sessions[activeHandle]?.messages ?? [];
        useSessionStore.getState().setSession(activeHandle, {
          messages: [...page.items, ...existing],
          nextBeforeEntryId: page.nextBeforeEntryId,
        });
        // Preserve scroll position after prepend
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      })
      .catch(console.error)
      .finally(() => useRequestStore.getState().set({ historyLoading: false }));
  }, [activeHandle, nextBeforeEntryId]);

  // Combined scroll handler
  const onScroll = useCallback(() => {
    handleScroll();
    handleScrollToTop();
  }, [handleScroll, handleScrollToTop]);

  if (!activeHandle) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-text-tertiary)]">
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

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-3"
    >
      {historyLoading && (
        <div className="mb-2 flex justify-center">
          <span className="text-xs text-[var(--color-text-tertiary)]">Loading history...</span>
        </div>
      )}

      <div className="mx-auto flex max-w-[var(--layout-content-max)] flex-col gap-4">
        {messages.map((msg) => (
          <MessageItem key={msg.entryId} message={msg} />
        ))}

        {/* Tool drafts */}
        {toolDrafts?.map((tool) => (
          <div key={tool.toolCallId}>
            <MessageItem
              message={{
                entryId: `tool-${tool.toolCallId}`,
                timestamp: new Date().toISOString(),
                role: "toolResult",
                content: tool.partialResult
                  ? JSON.stringify(tool.partialResult)
                  : undefined,
                meta: {
                  toolName: tool.toolName,
                  isError: false,
                  toolArgs: tool.args,
                },
              }}
              isStreaming={tool.status === "running"}
            />
          </div>
        ))}

        {/* Streaming draft */}
        {streamingDraft && (
          <MessageItem
            message={{
              entryId: streamingDraft.streamingMessageId,
              timestamp: new Date().toISOString(),
              role: "assistant",
              content: streamingDraft.text,
            }}
            isStreaming
          />
        )}
      </div>
    </div>
  );
}
