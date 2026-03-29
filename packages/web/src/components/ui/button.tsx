import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "default" | "accent" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 font-medium focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  default:
    "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
  accent:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
  danger:
    "text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]",
  ghost:
    "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
