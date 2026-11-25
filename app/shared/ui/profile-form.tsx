import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LabeledField } from "./labeled-field";

export function ProfileFormHeader({
  action,
  title,
  codeLabel,
  code,
  category,
}: {
  action: string;
  title: string;
  description?: string;
  codeLabel: string;
  code: string;
  category?: string;
}) {
  return (
    <header className="grid items-start gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:p-5">
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{action}</Badge>
          {category ? <Badge variant="outline">{category}</Badge> : null}
        </div>
        <h2 className="m-0 break-words text-xl font-semibold">{title}</h2>
      </div>
      <LabeledField label={codeLabel}>
        <Input className="w-full max-w-xs font-mono" readOnly value={code} />
      </LabeledField>
    </header>
  );
}

export function ProfileFormFooter({ message, children }: { message?: ReactNode; children: ReactNode }) {
  return (
    <footer className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card p-4">
      {message ? <p className="m-0 mr-auto text-xs text-muted-foreground">{message}</p> : null}
      <div className="flex flex-wrap gap-2">{children}</div>
    </footer>
  );
}
