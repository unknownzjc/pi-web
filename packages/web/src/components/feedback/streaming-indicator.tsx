export function StreamingIndicator({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="inline-flex items-center gap-1 text-[var(--color-accent-text)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse [animation-delay:200ms]" />
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse [animation-delay:400ms]" />
      </span>
    </span>
  );
}
