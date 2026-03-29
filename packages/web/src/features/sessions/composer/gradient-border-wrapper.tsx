import type { ReactNode } from "react";

interface GradientBorderWrapperProps {
  children: ReactNode;
  innerClassName?: string;
}

export function GradientBorderWrapper({ children, innerClassName }: GradientBorderWrapperProps) {
  return (
    <div
      className="gradient-border-outer rounded-[12px] shadow-[0_4px_4px_rgba(0,0,0,0.08)]"
      style={{
        border: "2px solid transparent",
        background:
          "linear-gradient(var(--color-bg-primary), var(--color-bg-primary)) padding-box, linear-gradient(180deg, var(--color-gradient-border-outer) 0%, transparent 40%, transparent 60%, var(--color-gradient-border-outer) 100%) border-box",
      }}
    >
      <div
        className={"gradient-border-inner overflow-hidden rounded-lg " + (innerClassName ?? "")}
        style={{
          color: "var(--color-text-primary)",
          background:
            "linear-gradient(var(--color-bg-tertiary)) padding-box, linear-gradient(0deg, var(--color-gradient-border-inner) 0, transparent 60%, transparent) border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
