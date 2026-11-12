import type { KeyboardEvent, ReactNode } from "react";

/** A table row that opens its detail drawer (or applies its action) when clicked or activated with Enter/Space. */
export function HrClickableRow({
  onOpen,
  disabled = false,
  children,
}: {
  onOpen: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const open = () => {
    if (!disabled) onOpen();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };
  return (
    <tr
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={open}
      onKeyDown={onKeyDown}
      className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
    >
      {children}
    </tr>
  );
}
