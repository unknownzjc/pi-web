import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
  disabled?: boolean;
}

export function Dropdown({
  trigger,
  children,
  align = "start",
  side = "bottom",
  className,
  disabled,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Position popup relative to trigger using a portal
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const style: React.CSSProperties = {
      position: "fixed",
      zIndex: 9999,
      minWidth: Math.max(rect.width, 140),
    };
    if (side === "top") {
      style.bottom = window.innerHeight - rect.top + 4;
    } else {
      style.top = rect.bottom + 4;
    }
    if (align === "end") {
      style.right = window.innerWidth - rect.right;
    } else {
      style.left = rect.left;
    }
    setPopupStyle(style);
  }, [open, side, align]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleTriggerClick = useCallback(() => {
    setOpen((o) => !o);
  }, []);

  if (disabled) {
    return <>{trigger}</>;
  }

  return (
    <>
      <div ref={triggerRef} className="relative inline-flex">
        <div onClick={handleTriggerClick}>{trigger}</div>
      </div>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            className={
              "overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg " +
              (className ?? "")
            }
            style={popupStyle}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

interface DropdownItemProps {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function DropdownItem({ children, active, disabled, onClick }: DropdownItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors " +
        (active
          ? "bg-[var(--color-accent)] text-white"
          : disabled
            ? "cursor-not-allowed text-[var(--color-text-tertiary)]"
            : "cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]")
      }
    >
      {children}
    </button>
  );
}
