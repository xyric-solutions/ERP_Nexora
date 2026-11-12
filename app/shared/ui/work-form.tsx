"use client";
import { useId, type ComponentProps } from "react";
import { cn } from "cn";
import { WorkFormContext } from "./work-surface-context";

const formSurface =
  "min-w-0 text-foreground [&_fieldset]:min-w-0 [&_fieldset]:border-0! [&_fieldset]:bg-transparent! [&_fieldset]:shadow-none! [&_legend]:text-sm [&_legend]:font-semibold [&_label]:text-foreground [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0";

/** A continuous form surface; original submit, field names and validation remain native. */
export function WorkForm({ className, children, ...props }: ComponentProps<"form">) {
  const id = useId();
  return (
    <WorkFormContext.Provider value={true}>
      <form {...props} data-work-form={id} className={cn(formSurface, className)}>
        {children}
      </form>
    </WorkFormContext.Provider>
  );
}

/** For governed editors whose save actions deliberately live outside a native form. */
export function WorkFormLayout({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <WorkFormContext.Provider value={true}>
      <div {...props} data-work-form-layout className={cn(formSurface, className)}>
        {children}
      </div>
    </WorkFormContext.Provider>
  );
}
