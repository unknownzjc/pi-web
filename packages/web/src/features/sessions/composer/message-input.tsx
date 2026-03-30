import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension, useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppStore } from "../../../app/store/app-store";
import { useSessionStore } from "../../../app/store/session-store";
import { useRequestStore } from "../../../app/store/request-store";
import { abortSession } from "../../../api/sessions";

import type { ImageAttachment } from "./image-paste-extension";
import { createImagePasteExtension } from "./image-paste-extension";
import { createMentionExtension } from "./mention-extension";
import { extractText } from "./extract-text";
import { GradientBorderWrapper } from "./gradient-border-wrapper";
import { AttachmentPreview } from "./attachment-preview";
import { InputToolbar } from "./input-toolbar";

interface ComposerProps {
  wsSend: (data: unknown) => void;
}

export function MessageInput({ wsSend }: ComposerProps) {
  const activeHandle = useAppStore((s) => s.activeSessionHandle);
  const workspaces = useAppStore((s) => s.workspaces);
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const cwd = workspaces.find((w) => w.workspaceId === selectedWorkspaceId)?.path;
  const sessionState = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle]?.state : undefined),
  );
  const promptError = useRequestStore((s) => s.promptError);

  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const wsSendRef = useRef(wsSend);
  wsSendRef.current = wsSend;

  const isStreaming = sessionState?.isStreaming ?? false;
  const disabled = !activeHandle;

  const currentModel = sessionState?.model;
  const availableModels = sessionState?.availableModels ?? [];
  const thinkingLevel = sessionState?.thinkingLevel;
  const availableThinkingLevels = sessionState?.availableThinkingLevels ?? [];

  const addAttachments = useCallback((images: ImageAttachment[]) => {
    setAttachments((prev) => [...prev, ...images]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const imagePasteExtension = useMemo(
    () => createImagePasteExtension(addAttachments),
    [addAttachments],
  );

  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const mentionExtension = useMemo(
    () => createMentionExtension(() => cwdRef.current),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        bold: false,
        italic: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: () =>
          disabled ? "Select a session to start..." : "Message Pi...",
      }),
      imagePasteExtension,
      mentionExtension,
      Extension.create({
        name: "chatKeymap",
        addProseMirrorPlugins() {
          const editor = this.editor;
          return [
            new Plugin({
              key: new PluginKey("chatKeymap"),
              props: {
                handleKeyDown(_view, event) {
                  // Bare Enter: send
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.altKey &&
                    !event.metaKey &&
                    !event.ctrlKey
                  ) {
                    event.preventDefault();
                    send();
                    return true;
                  }
                  // Shift+Enter or Cmd/Ctrl+Enter: hard break
                  if (
                    event.key === "Enter" &&
                    (event.shiftKey || event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    editor.commands.setHardBreak();
                    return true;
                  }
                  // Alt+Enter: hard break
                  if (event.key === "Enter" && event.altKey) {
                    editor.commands.setHardBreak();
                    return true;
                  }
                  // Escape: blur
                  if (event.key === "Escape") {
                    editor.commands.blur();
                    return true;
                  }
                  return false;
                },
              },
            }),
          ];

          function send() {
            // Read latest values from store/refs to avoid stale closures
            const currentHandle = useAppStore.getState().activeSessionHandle;
            const currentSessionState = currentHandle
              ? useSessionStore.getState().sessions[currentHandle]?.state
              : undefined;
            const currentIsStreaming = currentSessionState?.isStreaming ?? false;
            const currentAttachments = attachmentsRef.current;

            if (!editor || currentIsStreaming) return;
            const text = extractText(editor.getJSON());
            if (!text && currentAttachments.length === 0) return;
            // Add optimistic user message so it shows immediately.
            // The REST re-fetch when streaming ends will replace it
            // with the authoritative version (real JSONL entry ID).
            if (currentHandle && text) {
              const store = useSessionStore.getState();
              const session = store.sessions[currentHandle];
              const msgs = session?.messages ?? [];
              store.setSession(currentHandle, {
                messages: [
                  ...msgs,
                  {
                    entryId: `optimistic:${crypto.randomUUID()}`,
                    timestamp: new Date().toISOString(),
                    role: "user" as const,
                    content: text,
                  },
                ],
              });
            }
            wsSendRef.current({
              type: "session.prompt",
              sessionHandle: currentHandle,
              text,
            });
            if (currentAttachments.length > 0) {
              console.warn(
                "[composer] Image attachments are not yet supported by the backend. Sending text only.",
              );
            }
            editor.commands.clearContent();
            setAttachments([]);
          }
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[76px] max-h-[240px] overflow-y-auto px-3 py-2 text-sm outline-none bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]",
      },
    },
    editable: !disabled,
    autofocus: "end",
  });

  // Keep editable in sync
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Focus editor when session changes
  useEffect(() => {
    if (editor && !editor.isDestroyed && activeHandle) {
      editor.commands.focus("end");
    }
  }, [editor, activeHandle]);

  const handleSend = useCallback(() => {
    if (!editor || isStreaming) return;
    const text = extractText(editor.getJSON());
    if (!text && attachments.length === 0) return;
    // Add optimistic user message (see inline send() for explanation)
    if (activeHandle && text) {
      const store = useSessionStore.getState();
      const session = store.sessions[activeHandle];
      const msgs = session?.messages ?? [];
      store.setSession(activeHandle, {
        messages: [
          ...msgs,
          {
            entryId: `optimistic:${crypto.randomUUID()}`,
            timestamp: new Date().toISOString(),
            role: "user" as const,
            content: text,
          },
        ],
      });
    }
    wsSend({
      type: "session.prompt",
      sessionHandle: activeHandle,
      text,
    });
    if (attachments.length > 0) {
      console.warn(
        "[composer] Image attachments are not yet supported by the backend. Sending text only.",
      );
    }
    editor.commands.clearContent();
    setAttachments([]);
  }, [editor, isStreaming, activeHandle, attachments, wsSend]);

  const handleAbort = useCallback(() => {
    if (!activeHandle) return;
    abortSession(activeHandle).catch(console.error);
  }, [activeHandle]);

  const handleModelChange = useCallback(
    (provider: string, modelId: string) => {
      if (!activeHandle) return;
      wsSend({
        type: "session.set_model",
        sessionHandle: activeHandle,
        provider,
        modelId,
      });
    },
    [activeHandle, wsSend],
  );

  const handleThinkingLevelChange = useCallback(
    (level: string) => {
      if (!activeHandle) return;
      wsSend({
        type: "session.set_thinking_level",
        sessionHandle: activeHandle,
        level,
      });
    },
    [activeHandle, wsSend],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;
      Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<ImageAttachment>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl.split(",")[1] ?? "";
                resolve({
                  id: crypto.randomUUID(),
                  filename: file.name,
                  mediaType: file.type,
                  base64,
                });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }),
        ),
      ).then(addAttachments);
      e.target.value = "";
    },
    [addAttachments],
  );

  return (
    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-4 pt-4 pb-1">
      <div className="w-full max-w-[var(--layout-content-max)]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <GradientBorderWrapper innerClassName="focus-within:brightness-125">
          {/* Inline error bar */}
          {promptError && (
            <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-1.5 text-xs text-[var(--color-error)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6M9 9l6 6" />
              </svg>
              <span className="flex-1">{promptError}</span>
              <button
                onClick={() => useRequestStore.getState().set({ promptError: undefined })}
                className="text-[var(--color-error)] opacity-60 hover:opacity-100"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <EditorContent editor={editor} />

          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

          <InputToolbar
            disabled={disabled}
            streaming={isStreaming}
            onSend={handleSend}
            onCancel={handleAbort}
            onAttach={() => fileInputRef.current?.click()}
            currentModel={currentModel}
            availableModels={availableModels}
            onModelChange={handleModelChange}
            thinkingLevel={thinkingLevel}
            availableThinkingLevels={availableThinkingLevels}
            onThinkingLevelChange={handleThinkingLevelChange}
          />
        </GradientBorderWrapper>
      </div>
    </div>
  );
}
