import type { ImageAttachment } from "./image-paste-extension";

interface AttachmentPreviewProps {
  attachments: ImageAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-[var(--color-border-subtle)] px-3 py-2">
      {attachments.map((att) => (
        <div key={att.id} className="group relative rounded-md">
          <img
            src={`data:${att.mediaType};base64,${att.base64}`}
            alt={att.filename}
            className="h-14 w-14 rounded-md border border-[var(--color-border)] object-cover"
          />
          <button
            type="button"
            aria-label={`Remove ${att.filename}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-error)] text-white opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onRemove(att.id)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
