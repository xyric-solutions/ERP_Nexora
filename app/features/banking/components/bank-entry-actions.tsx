"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BankEntryActions({
  busy,
  saveDisabled,
  submitDisabled,
  approveDisabled,
  showApproval,
  onSave,
  onSubmit,
  onApprove,
}: {
  busy: boolean;
  saveDisabled: boolean;
  submitDisabled: boolean;
  approveDisabled: boolean;
  showApproval: boolean;
  onSave: () => void;
  onSubmit: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" type="button" disabled={busy || saveDisabled} onClick={onSave}>
        Save Draft
      </Button>
      <div className="inline-flex items-center gap-px" role="group" aria-label="Transaction completion actions">
        <Button
          type="button"
          className="rounded-r-none"
          disabled={busy || (showApproval ? approveDisabled : submitDisabled)}
          onClick={showApproval ? onApprove : onSubmit}
        >
          {busy ? "Working…" : showApproval ? "Approve & Close" : "Submit for Approval"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" size="icon" className="rounded-l-none" />}
            disabled={busy}
            aria-label="More transaction actions"
          >
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={saveDisabled} onClick={onSave}>
                Save Draft
              </DropdownMenuItem>
              <DropdownMenuItem disabled={submitDisabled} onClick={onSubmit}>
                Submit for Approval
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
