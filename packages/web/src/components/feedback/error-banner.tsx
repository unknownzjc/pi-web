import { Icon } from "../ui/icon.js";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
      <Icon name="x" size={14} />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-[var(--color-error)]/60 hover:text-[var(--color-error)]"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
