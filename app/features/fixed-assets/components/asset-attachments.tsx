"use client";
import { useState } from "react";
import type { AssetDetail } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Section } from "./asset-fields";

export function AssetAttachments({ detail, onUploaded }: { detail: AssetDetail; onUploaded: () => Promise<void> }) {
  const { api, session, csrfToken } = useSession(),
    [title, setTitle] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  const canUpload = session?.user.permissions.includes("assets.asset.edit") && !session?.impersonation;
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.uploadFixedAssetAttachment(
        detail.asset.id,
        { company_id: detail.asset.company_id, title },
        file,
        csrfToken(),
        key,
      );
      await onUploaded();
      setTitle("");
      setFile(null);
      setKey(crypto.randomUUID());
    } catch (error) {
      setError(error instanceof Error ? error.message : "The document could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string, name: string) {
    setError("");
    try {
      const blob = await api.downloadFixedAssetAttachment(detail.asset.id, id, detail.asset.company_id),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The document could not be downloaded.");
    }
  }
  return (
    <Section
      title="Images and supporting documents"
      description="PDF, PNG and JPEG files up to 10 MB. Uploaded files and their checksums remain in the asset’s audit history."
    >
      <div className="col-span-full space-y-3">
        {detail.attachments.map((attachment) => (
          <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{attachment.title}</p>
              <p className="break-words text-xs text-muted-foreground">
                {attachment.file_name} · {Math.ceil(attachment.size_bytes / 1024)} KB · {attachment.created_by}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void download(attachment.id, attachment.file_name)}
            >
              Download {attachment.title}
            </Button>
          </div>
        ))}
        {!detail.attachments.length && <p className="text-sm text-muted-foreground">No files attached.</p>}
        {canUpload && (
          <form onSubmit={upload} onChangeCapture={() => setKey(crypto.randomUUID())}>
            <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
              <Field label="Document title">
                <Input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Image or supporting document">
                <Input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Field>
              <Button type="submit" disabled={!file || !title.trim() || busy}>
                {busy ? "Uploading…" : "Attach document"}
              </Button>
            </fieldset>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}
