"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "cn";

export function LabeledField({
  label,
  children,
  className,
  labelClassName,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  hint?: ReactNode;
}) {
  const generatedId = useId();
  const child = isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const controlId = child?.props.id ?? generatedId;

  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <label className={cn("text-sm font-medium leading-tight text-foreground", labelClassName)} htmlFor={controlId}>
        {label}
      </label>
      {child ? cloneElement(child, child.props.id ? undefined : { id: controlId }) : children}
      {hint ? <p className="m-0 text-xs font-normal leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
