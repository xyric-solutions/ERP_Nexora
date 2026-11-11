import type { ComponentProps } from "react";
import { cn } from "cn";
import { LabeledField } from "@/shared/ui/labeled-field";

/** Aligned label/control rows shared by bill and payment entry. */
export function PurchaseFormField({ className, labelClassName, ...props }: ComponentProps<typeof LabeledField>) {
  return (
    <LabeledField
      {...props}
      className={cn("sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center sm:gap-x-3", className)}
      labelClassName={cn("sm:leading-snug", labelClassName)}
    />
  );
}
