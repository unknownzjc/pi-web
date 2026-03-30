import type { Editor } from "@tiptap/react";

export function positionAboveInput(editor: Editor, container: HTMLDivElement) {
  const editorEl = editor.view.dom;

  let inputContainer: HTMLElement | null = editorEl;
  while (inputContainer && !inputContainer.classList.contains("tiptap")) {
    inputContainer = inputContainer.parentElement;
  }
  const targetEl = inputContainer?.parentElement;
  if (!targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const gap = 4;
  container.style.left = `${rect.left}px`;
  container.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  container.style.width = `${rect.width}px`;
}
