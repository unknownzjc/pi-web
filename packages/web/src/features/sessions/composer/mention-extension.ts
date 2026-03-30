import type { SuggestionProps } from "@tiptap/suggestion";
import Mention from "@tiptap/extension-mention";
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";

import { searchFiles, type SearchEntry } from "../../../api/filesystem";
import {
  SuggestionList,
  type SuggestionListHandle,
} from "./suggestion-list";
import { positionAboveInput } from "./suggestion-position";

let searchVersion = 0;

export function createMentionExtension(getCwd: () => string | undefined) {
  return Mention.configure({
    HTMLAttributes: { class: "mention" },
    suggestion: {
      items: async ({ query }: { query: string }): Promise<SearchEntry[]> => {
        const cwd = getCwd();
        if (!cwd) return [];

        const version = ++searchVersion;

        // Debounce: wait 100ms for typing to settle
        await new Promise((r) => setTimeout(r, 100));
        if (version !== searchVersion) return [];

        try {
          const entries = await searchFiles(cwd, query, 15);
          if (version !== searchVersion) return [];
          return entries;
        } catch {
          return [];
        }
      },
      command: ({ editor, range, props }: any) => {
        const entry = props as SearchEntry;
        if (entry.isDirectory) {
          // Drill-down: replace @query with @dir/ to re-trigger suggestion
          editor
            .chain()
            .focus()
            .insertContentAt(range, `@${entry.path}`)
            .run();
          return;
        }

        // Normal file: insert as mention node
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "mention",
              attrs: { id: entry.path, label: entry.name },
            },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => {
        let root: ReturnType<typeof createRoot> | null = null;
        let container: HTMLDivElement | null = null;
        const ref = createRef<SuggestionListHandle>();

        return {
          onStart(props: SuggestionProps) {
            container = document.createElement("div");
            container.style.position = "fixed";
            container.style.zIndex = "50";
            container.dataset.suggestionPopup = "";
            document.body.appendChild(container);
            root = createRoot(container);
            root.render(
              createElement(SuggestionList, {
                ref,
                items: props.items as SearchEntry[],
                command: props.command as (item: SearchEntry) => void,
              }),
            );
            positionAboveInput(props.editor, container);
          },
          onUpdate(props: SuggestionProps) {
            root?.render(
              createElement(SuggestionList, {
                ref,
                items: props.items as SearchEntry[],
                command: props.command as (item: SearchEntry) => void,
              }),
            );
            if (container) positionAboveInput(props.editor, container);
          },
          onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === "Escape") {
              cleanup();
              return true;
            }
            return ref.current?.onKeyDown(props) ?? false;
          },
          onExit() {
            cleanup();
          },
        };

        function cleanup() {
          root?.unmount();
          container?.remove();
          root = null;
          container = null;
        }
      },
    },
  });
}
