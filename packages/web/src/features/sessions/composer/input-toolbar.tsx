import { Icon } from "../../../components/ui/icon";
import { Dropdown, DropdownItem } from "../../../components/ui/dropdown";

interface InputToolbarProps {
  disabled: boolean;
  streaming: boolean;
  onSend: () => void;
  onCancel: () => void;
  onAttach: () => void;
  currentModel?: { provider: string; id: string; displayName?: string };
  availableModels: { provider: string; id: string; name: string }[];
  onModelChange: (provider: string, modelId: string) => void;
  thinkingLevel?: string;
  availableThinkingLevels: string[];
  onThinkingLevelChange: (level: string) => void;
}

export function InputToolbar({
  disabled,
  streaming,
  onSend,
  onCancel,
  onAttach,
  currentModel,
  availableModels,
  onModelChange,
  thinkingLevel,
  availableThinkingLevels,
  onThinkingLevelChange,
}: InputToolbarProps) {
  const showThinking = availableThinkingLevels.length > 0 && currentModel;

  return (
    <div className="flex items-center gap-1 border-t border-[var(--color-border-subtle)] px-2 py-2 bg-[var(--color-bg-tertiary)]" role="toolbar">
      {/* Attach button */}
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
        onClick={onAttach}
        disabled={disabled}
        title="Attach image"
      >
        <Icon name="paperclip" size={16} />
      </button>

      {/* Model selector */}
      {currentModel && (
        <Dropdown
          side="top"
          align="start"
          disabled={disabled || streaming || availableModels.length === 0}
          className="max-h-64"
          trigger={
            <div className="inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] cursor-pointer">
              <span className="min-w-0 truncate">
                {currentModel.displayName ?? currentModel.id}
              </span>
              <Icon name="chevron-down" size={12} className="shrink-0 opacity-50" />
            </div>
          }
        >
          <div className="py-0.5">
            {currentModel && (
              <DropdownItem active>
                {currentModel.displayName ?? currentModel.id}
              </DropdownItem>
            )}
            {availableModels
              .filter(
                (m) =>
                  m.provider !== currentModel.provider || m.id !== currentModel.id,
              )
              .map((m) => (
                <DropdownItem
                  key={`${m.provider}/${m.id}`}
                  onClick={() => onModelChange(m.provider, m.id)}
                >
                  {m.name}
                </DropdownItem>
              ))}
          </div>
        </Dropdown>
      )}

      {/* Thinking level selector */}
      {showThinking && (
        <Dropdown
          side="top"
          align="start"
          disabled={disabled || streaming}
          trigger={
            <div className="inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-[var(--color-text-secondary)] capitalize transition-colors hover:bg-[var(--color-bg-hover)] cursor-pointer">
              <span className="min-w-0 truncate">
                {thinkingLevel === "off" ? "No thinking" : thinkingLevel ?? "Thinking"}
              </span>
              <Icon name="chevron-down" size={12} className="shrink-0 opacity-50" />
            </div>
          }
        >
          <div className="py-0.5">
            {availableThinkingLevels.map((level) => (
              <DropdownItem
                key={level}
                active={level === (thinkingLevel ?? "off")}
                onClick={() => onThinkingLevelChange(level)}
              >
                {level === "off" ? "No thinking" : level}
              </DropdownItem>
            ))}
          </div>
        </Dropdown>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Send / Stop button */}
      {streaming ? (
        <button
          type="button"
          className="relative flex h-7 w-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-bg-active)] text-[var(--color-text-primary)] transition-all duration-150 hover:bg-[var(--color-bg-hover)] active:scale-95"
          onClick={onCancel}
          title="Stop"
        >
          <span className="absolute inset-0 rounded-full border border-[var(--color-text-tertiary)] animate-pulse" />
          <Icon name="stop" size={10} />
        </button>
      ) : (
        <button
          type="button"
          className={
            disabled || !currentModel
              ? "flex h-7 w-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)] cursor-not-allowed"
              : "flex h-7 w-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition-all duration-150 hover:bg-[var(--color-accent-hover)] active:scale-95"
          }
          disabled={disabled}
          onClick={onSend}
          title="Send"
        >
          <Icon name="send" size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
