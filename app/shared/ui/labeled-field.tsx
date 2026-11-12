"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "cn";
import { useWorkForm } from "./work-surface-context";

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
  const inWorkForm = useWorkForm();
  const child = isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const controlId = child?.props.id ?? generatedId;
  const content = (
    <>
      <label className={cn("text-sm font-medium leading-tight text-foreground", labelClassName)} htmlFor={controlId}>
        {label}
      </label>
      {child ? cloneElement(child, child.props.id ? undefined : { id: controlId }) : children}
      {hint ? (
        <p
          className={cn(
            "m-0 text-xs font-normal leading-snug text-muted-foreground",
            inWorkForm && "@[22rem]/work-field:col-start-2",
          )}
        >
          {hint}
        </p>
      ) : null}
    </>
  );

  return (
    <div className={cn("grid min-w-0 gap-1.5", inWorkForm && "@container/work-field", className)}>
      {inWorkForm ? (
        <div className="contents @[22rem]/work-field:col-span-full @[22rem]/work-field:grid @[22rem]/work-field:grid-cols-[7rem_minmax(0,1fr)] @[22rem]/work-field:items-center @[22rem]/work-field:gap-x-3 @[22rem]/work-field:gap-y-1.5">
          {content}
        </div>
      ) : (
        content
      )}
    </div>
  );
}
