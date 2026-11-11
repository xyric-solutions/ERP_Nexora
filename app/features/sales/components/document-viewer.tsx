"use client";

/**
 * Full-screen frame for the printable Sales documents (invoice / quotation
 * PDF and the Receipts voucher).
 *
 * It is a portalled Base UI dialog, so it always covers the whole window and
 * centres the paper, even when it is opened from inside a side panel: a
 * nested dialog sits above its parent sheet, takes focus, and Escape closes
 * only the viewer. Print styles key off `data-print-viewer`.
 */

import { useRef, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { salesLayer } from "./sales-ui";

/** Outline button style for the dark viewer toolbar. */
export const viewerToolbarButton =
  "border-[var(--nx-emphasis-border)]! bg-transparent! text-[var(--nx-emphasis-text)]! hover:bg-[var(--nx-emphasis-surface-hover)]!";

export function DocumentViewerFrame({
  label,
  title,
  subtitle,
  iconClassName,
  tools,
  onClose,
  children,
}: {
  /** Accessible name of the viewer dialog. */
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  iconClassName?: string;
  /** Toolbar controls shown before Close (zoom, Download, Print…). */
  tools?: ReactNode;
  onClose: () => void;
  /** The paper sheet. */
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* The popup carries its own scrim: Base UI skips the backdrop of a dialog nested in a side panel. */}
        <DialogPrimitive.Popup
          data-print-viewer
          aria-label={label}
          initialFocus={closeRef}
          className={cn("fixed inset-0 flex flex-col bg-[var(--nx-overlay-scrim-strong)] outline-none", salesLayer.viewer)}
        >
          <div className="nx-no-print flex flex-wrap items-center gap-2.5 border-b border-[var(--nx-emphasis-border)] bg-[var(--nx-emphasis-background)] px-4 py-2 text-[var(--nx-emphasis-text)]">
            <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 font-semibold">
              <FileText className={cn("size-5 shrink-0", iconClassName)} aria-hidden="true" />
              <DialogPrimitive.Title className="m-0 truncate text-sm font-semibold">
                {title} {subtitle ? <small className="font-normal text-[var(--nx-emphasis-muted)]">· {subtitle}</small> : null}
              </DialogPrimitive.Title>
            </div>
            {tools}
            <Button ref={closeRef} type="button" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="grid flex-1 content-start justify-center overflow-auto px-4 pt-6 pb-10">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
