import type { GitDiffData } from "../../app/store/git-store.js";

interface GitDiffPaneProps {
  diff: GitDiffData | null;
  loading: boolean;
}

export function GitDiffPane({ diff, loading }: GitDiffPaneProps) {
  if (!diff) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-tertiary)]">
        Select a file to view diff
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-tertiary)]">
        Loading diff...
      </div>
    );
  }

  if (diff.isBinary) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-tertiary)]">
        Binary file - cannot display
      </div>
    );
  }

  if (diff.tooLarge) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-tertiary)]">
        File too large to preview
      </div>
    );
  }

  if (!diff.diffText) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-tertiary)]">
        No diff available
      </div>
    );
  }

  const lines = diff.diffText.split("\n");

  return (
    <div className="flex-1 overflow-auto">
      <pre className="p-3 font-mono text-xs leading-5">
        {lines.map((line, i) => {
          let lineClass = "text-[var(--color-text-secondary)]";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            lineClass = "bg-emerald-500/10 text-emerald-400";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            lineClass = "bg-red-500/10 text-red-400";
          } else if (line.startsWith("@@")) {
            lineClass = "text-[var(--color-accent-text)]";
          }
          return (
            <div key={i} className={`${lineClass} px-1`}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
