import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "cn";

const capsuleClass =
  "inline-flex max-w-full items-center rounded-full border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-2.5 py-1 text-xs font-semibold leading-none text-[var(--nx-warning)] transition-colors";

export function BankAccountCapsule({
  children,
  className,
  onClick,
  ...buttonProps
}: {
  children: ReactNode;
  className?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "onClick">) {
  if (onClick) {
    return (
      <button
        className={cn(
          capsuleClass,
          "cursor-pointer hover:border-[var(--nx-selection-border)] hover:bg-[var(--nx-brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        type="button"
        onClick={onClick}
        {...buttonProps}
      >
        <span className="truncate">{children}</span>
      </button>
    );
  }

  return <span className={cn(capsuleClass, className)}>{children}</span>;
}
