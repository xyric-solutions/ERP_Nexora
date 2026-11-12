"use client";

import type { ComponentProps } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  /** Accessible name and hover tooltip; the button itself shows only the icon. */
  label: string;
};

/**
 * HR & Payroll icon-only actions. Back always sits at the left of its row; edit
 * and delete keep their previous wording as the accessible name and tooltip.
 */
export function HrBackButton({ label, variant = "ghost", ...props }: IconButtonProps) {
  return (
    <Button type="button" size="icon" variant={variant} aria-label={label} title={label} {...props}>
      <ArrowLeft />
    </Button>
  );
}

export function HrEditButton({ label, variant = "outline", ...props }: IconButtonProps) {
  return (
    <Button type="button" size="icon" variant={variant} aria-label={label} title={label} {...props}>
      <Pencil />
    </Button>
  );
}

export function HrDeleteButton({ label, variant = "destructive", ...props }: IconButtonProps) {
  return (
    <Button type="button" size="icon" variant={variant} aria-label={label} title={label} {...props}>
      <Trash2 />
    </Button>
  );
}
