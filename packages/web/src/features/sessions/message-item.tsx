import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import type { SessionMessageDto } from "../../types/dto.js";

/* ──────────────────────────────────────────────────────────────────────────
 * UserMessage — left-aligned bordered bubble with sticky header
 * ────────────────────────────────────────────────────────────────────────── */

export function UserMessage({ message }: { message: SessionMessageDto }) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsClamp, setNeedsClamp] = useState(false);

  const text =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

  useEffect(() => {
    if (contentRef.current) {
      setNeedsClamp(contentRef.current.scrollHeight > 60);
    }
  }, [text]);

  return (
    <div
      className="sticky top-0 z-[2] items-start pt-3.5 pb-3"
      style={{
        backgroundImage: [
          "linear-gradient(var(--color-bg-primary) 0%, var(--color-bg-primary) calc(100% - 10px), transparent 100%)",
          "linear-gradient(var(--color-bg-primary) 0%, var(--color-bg-primary) calc(100% - 10px), transparent 100%)",
        ].join(", "),
      }}
    >
      <div className="relative">
        <div
          ref={contentRef}
          className={clsx(
            "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]",
            "px-1.5 py-1 text-sm text-[var(--color-text-primary)]",
            "whitespace-pre-wrap break-words select-text",
            needsClamp && !expanded && "content-clamp",
          )}
        >
          {text}
        </div>
        {needsClamp && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 block text-xs text-[var(--color-accent-text)] hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * TimelineMessage — wrapper providing dot + vertical line
 * ────────────────────────────────────────────────────────────────────────── */

interface TimelineMessageProps {
  message: SessionMessageDto;
  isStreaming?: boolean;
  isLastInTimeline?: boolean;
}

function getDotColor(message: SessionMessageDto, isStreaming?: boolean): string {
  if (isStreaming) return "var(--color-text-tertiary)";
  if (message.meta?.isError) return "var(--color-error)";
  if (message.role === "toolResult" || message.role === "bashExecution") {
    return "var(--color-success)";
  }
  if (message.role === "assistant") return "var(--color-success)";
  return "var(--color-text-tertiary)";
}

export function TimelineMessage({
  message,
  isStreaming,
  isLastInTimeline,
}: TimelineMessageProps) {
  const dotColor = getDotColor(message, isStreaming);

  return (
    <div className="relative py-2 pl-[30px]">
      {/* Vertical line */}
      <div
        className="absolute left-[12px] top-0 w-px bg-[var(--color-border-subtle)]"
        style={{ bottom: isLastInTimeline ? "50%" : 0 }}
      />
      {/* Dot — top:15px aligns with center of first text line (8px padding + line-height/2) */}
      <div
        className={clsx(
          "absolute left-[9px] top-[15px] z-[1] h-[7px] w-[7px] rounded-full",
          isStreaming &&
            "animate-[timeline-dot-blink_1.2s_ease-in-out_infinite]",
        )}
        style={{ backgroundColor: dotColor }}
      />
      {/* Content */}
      <TimelineContent message={message} isStreaming={isStreaming} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * TimelineContent — dispatches to role-specific renderer
 * ────────────────────────────────────────────────────────────────────────── */

function TimelineContent({
  message,
  isStreaming,
}: {
  message: SessionMessageDto;
  isStreaming?: boolean;
}) {
  const { role, content } = message;

  if (role === "toolResult" || role === "bashExecution") {
    return <ToolPanel message={message} isStreaming={isStreaming} />;
  }

  if (role === "branchSummary" || role === "compactionSummary") {
    return (
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          {typeof content === "string" ? content : "Summary"}
        </span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
    );
  }

  if (role === "assistant") {
    return <AssistantContent message={message} isStreaming={isStreaming} />;
  }

  // Fallback
  return (
    <div className="text-xs text-[var(--color-text-tertiary)]">
      [{role}] {typeof content === "string" ? content : JSON.stringify(content)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AssistantContent — thinking + markdown + streaming cursor
 * ────────────────────────────────────────────────────────────────────────── */

function AssistantContent({
  message,
  isStreaming,
}: {
  message: SessionMessageDto;
  isStreaming?: boolean;
}) {
  const { content, meta } = message;

  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content) && content.length === 0) {
    text = "";
  } else {
    text = content != null ? JSON.stringify(content) : "";
  }

  const isTrivialJson =
    text === "[]" || text === "{}" || text === "null" || text === '""';

  return (
    <div>
      {meta?.thinking && (
        <ThinkingBlock thinking={meta.thinking} isStreaming={isStreaming} />
      )}
      {text && !isTrivialJson && (
        <div className="markdown-root text-sm leading-relaxed text-[var(--color-text-primary)]">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </Markdown>
        </div>
      )}
      {isStreaming && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--color-accent)]" />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ThinkingBlock — V2 collapsible with timing label
 * ────────────────────────────────────────────────────────────────────────── */

function ThinkingBlock({
  thinking,
  isStreaming,
}: {
  thinking: string;
  isStreaming?: boolean;
}) {
  const seconds = Math.max(1, Math.round(thinking.length / 15));
  const label = isStreaming ? "Thinking..." : `Thought for ${seconds}s`;

  return (
    <details className="group mb-2">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-sm text-[var(--color-text-tertiary)] opacity-80 hover:opacity-100 group-open:opacity-100 [&::-webkit-details-marker]:hidden list-none">
        <span>{label}</span>
        <svg
          className="h-4 w-4 shrink-0 transition-transform duration-150 group-open:rotate-90"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4.5 2l4 4-4 4z" />
        </svg>
      </summary>
      <div className="mt-1">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {thinking}
        </p>
      </div>
    </details>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ToolPanel — collapsible <details> with summary + body
 * ────────────────────────────────────────────────────────────────────────── */

/** Lowercase tool name check */
function isEditTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return lower === "edit" || lower === "write";
}

function ToolPanel({
  message,
  isStreaming,
}: {
  message: SessionMessageDto;
  isStreaming?: boolean;
}) {
  const { content, meta } = message;
  const rawToolName = meta?.toolName ?? "Tool";
  const toolName = rawToolName.charAt(0).toUpperCase() + rawToolName.slice(1);
  const args = meta?.toolArgs as Record<string, unknown> | undefined;

  // Extract secondary text (file path, command, etc.)
  const secondaryText = getToolSecondaryText(args);

  // Secondary description line (below summary)
  const secondaryLine = getSecondaryLine(toolName, content, args);

  return (
    <div>
      {/* Tool summary header — mirrors reference extension structure */}
      <div className="flex items-center gap-1 text-sm leading-[19px] max-w-full overflow-hidden">
        <span className="font-bold shrink-0">{toolName}</span>
        {secondaryText && (
          <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[0.85em] text-[var(--color-accent-text)] break-all">
            {secondaryText}
          </span>
        )}
        {isStreaming && (
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--color-warning)] animate-pulse" />
        )}
      </div>
      {/* Secondary description line */}
      {secondaryLine && (
        <div className="mt-0.5 mb-0.5 inline-flex items-start gap-1 text-[0.85em] text-[var(--color-text-tertiary)] opacity-70">
          <span>{secondaryLine}</span>
        </div>
      )}
      <ToolBody toolName={toolName} content={content} args={args} />
    </div>
  );
}

function getToolSecondaryText(
  args: Record<string, unknown> | undefined,
): string | null {
  if (!args) return null;
  const candidate = (args.file_path ?? args.path ?? args.command) as
    | string
    | undefined;
  return typeof candidate === "string" ? candidate : null;
}

/** Derive a secondary description line — matches reference extension dw0() */
function getSecondaryLine(
  toolName: string,
  content: unknown,
  args: Record<string, unknown> | undefined,
): string | null {
  if (isEditTool(toolName) && args) {
    // Check for error
    if (typeof content === "string" && content.toLowerCase().includes("error")) {
      return "Edit failed";
    }
    const oldStr = (args.old_string ?? "") as string;
    const newStr = (args.new_string ?? args.content ?? "") as string;
    const oldLines = oldStr ? oldStr.split("\n").length : 0;
    const newLines = newStr ? newStr.split("\n").length : 0;
    const added = Math.max(0, newLines - oldLines);
    const removed = Math.max(0, oldLines - newLines);

    if (added > 0 && removed > 0) {
      return `Added ${added} line${added !== 1 ? "s" : ""}, removed ${removed} line${removed !== 1 ? "s" : ""}`;
    }
    if (added > 0) return `Added ${added} line${added !== 1 ? "s" : ""}`;
    if (removed > 0) return `Removed ${removed} line${removed !== 1 ? "s" : ""}`;
    return "Modified";
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * ToolBody — dispatches to role-specific body renderer
 * ────────────────────────────────────────────────────────────────────────── */

/** Keys already shown in the summary secondary text — skip in grid */
const SUMMARY_KEYS = new Set(["file_path", "path", "command"]);

function ToolBody({
  toolName,
  content,
  args,
}: {
  toolName: string;
  content: unknown;
  args: Record<string, unknown> | undefined;
}) {
  const lower = toolName.toLowerCase();

  // Read → just file path
  if (lower === "read") {
    const filePath = (args?.file_path ?? args?.path) as string | undefined;
    return (
      <div className="mt-2 rounded-[5px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 py-2">
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
          {filePath ?? "File read completed"}
        </span>
      </div>
    );
  }

  // Edit / Write → inline diff view
  if (isEditTool(toolName) && args) {
    return <EditDiffBody args={args} content={content} />;
  }

  // Default: grid arg layout + result
  return <DefaultToolBody content={content} args={args} />;
}

/* ──────────────────────────────────────────────────────────────────────────
 * EditDiffBody — inline diff for Edit/Write tools (design doc §7)
 * ────────────────────────────────────────────────────────────────────────── */

function EditDiffBody({
  args,
  content,
}: {
  args: Record<string, unknown>;
  content: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const diffRef = useRef<HTMLDivElement>(null);
  const [needsClamp, setNeedsClamp] = useState(false);

  const oldStr = (args.old_string ?? "") as string;
  const newStr = (args.new_string ?? args.content ?? "") as string;
  const oldLines = oldStr ? oldStr.split("\n") : [];
  const newLines = newStr ? newStr.split("\n") : [];
  const hasContent = oldLines.length > 0 || newLines.length > 0;

  // Result text (e.g. success message)
  const resultText =
    typeof content === "string" && content.length > 0 ? content : null;

  useEffect(() => {
    if (diffRef.current) {
      setNeedsClamp(diffRef.current.scrollHeight > 200);
    }
  }, [oldStr, newStr]);

  if (!hasContent && !resultText) return null;

  return (
    <div
      className="mt-2 overflow-hidden rounded-[5px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {hasContent && (
        <div className="relative">
          <div
            ref={diffRef}
            className={clsx(
              "overflow-x-auto font-[family-name:var(--font-mono)] text-xs leading-[19px]",
              !expanded && "max-h-[200px] overflow-hidden",
            )}
          >
            {oldLines.map((line, i) => (
              <div
                key={`del-${i}`}
                className="whitespace-pre px-2"
                style={{
                  backgroundColor: "var(--color-diff-del-bg)",
                  color: "var(--color-diff-del-fg)",
                }}
              >
                <span className="mr-2 inline-block w-3 select-none opacity-60">
                  -
                </span>
                {line}
              </div>
            ))}
            {newLines.map((line, i) => (
              <div
                key={`add-${i}`}
                className="whitespace-pre px-2"
                style={{
                  backgroundColor: "var(--color-diff-add-bg)",
                  color: "var(--color-diff-add-fg)",
                }}
              >
                <span className="mr-2 inline-block w-3 select-none opacity-60">
                  +
                </span>
                {line}
              </div>
            ))}
          </div>
          {/* Truncation gradient + click to expand overlay (matches reference) */}
          {needsClamp && !expanded && (
            <div
              className="absolute inset-0 flex cursor-pointer items-end justify-center"
              onClick={() => setExpanded(true)}
            >
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-[30px]"
                style={{
                  background:
                    "linear-gradient(transparent 0%, var(--color-bg-secondary) 100%)",
                }}
              />
              {isHovered && (
                <span className="relative z-10 mb-1.5 rounded bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs text-[var(--color-accent-text)] shadow">
                  Click to expand
                </span>
              )}
            </div>
          )}
          {expanded && needsClamp && (
            <button
              onClick={() => setExpanded(false)}
              className="w-full border-t border-[var(--color-border-subtle)] py-1 text-center text-xs text-[var(--color-accent-text)] hover:underline"
            >
              Show less
            </button>
          )}
        </div>
      )}
      {resultText && (
        <div
          className={clsx(
            "px-3 py-1.5 text-xs text-[var(--color-text-tertiary)]",
            hasContent && "border-t border-[var(--color-border-subtle)]",
          )}
        >
          {resultText}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * DefaultToolBody — CSS Grid arg layout (label | value) for generic tools
 * ────────────────────────────────────────────────────────────────────────── */

function DefaultToolBody({
  content,
  args,
}: {
  content: unknown;
  args: Record<string, unknown> | undefined;
}) {
  // Filter args: skip keys already in summary, skip empty values
  const gridEntries = args
    ? Object.entries(args).filter(
        ([key, val]) => !SUMMARY_KEYS.has(key) && val != null && val !== "",
      )
    : [];

  const displayContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);

  if (gridEntries.length === 0 && !displayContent) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-[5px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
      {/* Arg grid */}
      {gridEntries.length > 0 && (
        <div
          className="grid"
          style={{ gridTemplateColumns: "max-content 1fr" }}
        >
          {gridEntries.map(([key, val], i) => (
            <Fragment key={key}>
              <div
                className={clsx(
                  "px-2 py-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-tertiary)] opacity-50",
                  i > 0 && "border-t border-[var(--color-border-subtle)]",
                )}
              >
                {key}
              </div>
              <div
                className={clsx(
                  "content-clamp whitespace-pre-wrap break-words px-2 py-1 font-[family-name:var(--font-mono)] text-sm text-[var(--color-text-secondary)]",
                  i > 0 && "border-t border-[var(--color-border-subtle)]",
                )}
              >
                {typeof val === "string" ? val : JSON.stringify(val)}
              </div>
            </Fragment>
          ))}
        </div>
      )}

      {/* Tool result content */}
      {displayContent && (
        <ToolResultContent content={displayContent} hasGrid={gridEntries.length > 0} />
      )}
    </div>
  );
}

/** Collapsible tool result shown below the arg grid */
function ToolResultContent({
  content,
  hasGrid,
}: {
  content: string;
  hasGrid: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [needsClamp, setNeedsClamp] = useState(false);

  useEffect(() => {
    if (bodyRef.current) {
      setNeedsClamp(bodyRef.current.scrollHeight > 60);
    }
  }, [content]);

  return (
    <>
      <div
        ref={bodyRef}
        className={clsx(
          "px-3 py-2",
          hasGrid && "border-t border-[var(--color-border-subtle)]",
          needsClamp && !expanded && "content-clamp",
        )}
      >
        <pre className="whitespace-pre-wrap break-all font-[family-name:var(--font-mono)] text-sm text-[var(--color-text-secondary)]">
          {content}
        </pre>
      </div>
      {needsClamp && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-[var(--color-border-subtle)] py-1 text-center text-xs text-[var(--color-accent-text)] hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Markdown — custom components (code block copy button)
 * ────────────────────────────────────────────────────────────────────────── */

function CopyButton({ textRef }: { textRef: React.RefObject<HTMLPreElement | null> }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(() => {
    const text = textRef.current?.textContent ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [textRef]);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-1 top-1 rounded bg-[var(--color-bg-elevated)] px-1.5 py-1 text-xs text-[var(--color-text-secondary)] opacity-0 transition-opacity duration-150 hover:opacity-100 group-hover/codeblock:opacity-80"
      title="Copy"
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function CodeBlock(props: React.HTMLAttributes<HTMLPreElement> & { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const { children, ...rest } = props;
  return (
    <div className="group/codeblock relative">
      <pre ref={preRef} {...rest}>
        {children}
      </pre>
      <CopyButton textRef={preRef} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markdownComponents: Record<string, React.ComponentType<any>> = {
  pre: CodeBlock,
};
