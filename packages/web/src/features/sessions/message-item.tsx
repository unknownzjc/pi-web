import { useState } from "react";
import Markdown from "react-markdown";
import type { SessionMessageDto } from "../../types/dto.js";

interface MessageItemProps {
  message: SessionMessageDto;
  isStreaming?: boolean;
}

function ToolCard({
  toolName,
  status,
  isError,
  children,
}: {
  toolName: string;
  status: "running" | "done";
  isError?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="my-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        {status === "running" ? (
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        ) : isError ? (
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
        )}
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          {toolName}
        </span>
        <span className="text-[10px] text-[var(--color-text-tertiary)] capitalize">
          {status}
        </span>
      </div>
      {children && (
        <div className="border-t border-[var(--color-border-subtle)] px-3 py-2">
          {children}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group mb-2"
    >
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] select-none">
        <svg
          className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4.5 2l4 4-4 4z" />
        </svg>
        Thinking
      </summary>
      <div className="mt-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 py-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          {thinking}
        </p>
      </div>
    </details>
  );
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const { role, content, meta } = message;

  // Tool result / bash execution
  if (role === "toolResult" || role === "bashExecution") {
    const toolName = meta?.toolName ?? "Tool";

    // For read tools, show only the file path instead of full content
    if (toolName === "read") {
      const args = meta?.toolArgs as Record<string, unknown> | undefined;
      const filePath = (args?.file_path ?? args?.path) as string | undefined;
      return (
        <ToolCard
          toolName={toolName}
          status={isStreaming ? "running" : "done"}
          isError={meta?.isError}
        >
          {filePath ? (
            <span className="font-mono text-xs text-[var(--color-text-secondary)]">
              {filePath}
            </span>
          ) : (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              File read completed
            </span>
          )}
        </ToolCard>
      );
    }

    return (
      <ToolCard
        toolName={toolName}
        status={isStreaming ? "running" : "done"}
        isError={meta?.isError}
      >
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-[var(--color-text-secondary)]">
          {typeof content === "string" ? content : JSON.stringify(content, null, 2)}
        </pre>
      </ToolCard>
    );
  }

  // Branch / compaction summary
  if (role === "branchSummary" || role === "compactionSummary") {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          {typeof content === "string" ? content : "Summary"}
        </span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
    );
  }

  // User message
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
            {typeof content === "string" ? content : JSON.stringify(content)}
          </p>
        </div>
      </div>
    );
  }

  // Assistant message
  if (role === "assistant") {
    let text: string;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content) && content.length === 0) {
      text = "";
    } else {
      text = content != null ? JSON.stringify(content) : "";
    }
    // Skip rendering bare JSON artifacts like "[]", "{}", "null"
    const isTrivialJson = text === "[]" || text === "{}" || text === "null" || text === '""';

    return (
      <div className="flex gap-2.5">
        {/* Avatar */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-[10px] font-bold text-white">
          P
        </div>
        <div className="min-w-0 flex-1">
          {meta?.thinking && <ThinkingBlock thinking={meta.thinking} />}
          {text && !isTrivialJson && (
            <div className="prose-invert max-w-none text-sm leading-relaxed text-[var(--color-text-primary)] [&_pre]:rounded-[var(--radius-sm)] [&_pre]:bg-[var(--color-bg-primary)] [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_code]:rounded [&_code]:bg-[var(--color-bg-primary)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
              <Markdown>{text}</Markdown>
            </div>
          )}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--color-accent)]" />
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-xs text-[var(--color-text-tertiary)]">
      [{role}] {typeof content === "string" ? content : JSON.stringify(content)}
    </div>
  );
}
