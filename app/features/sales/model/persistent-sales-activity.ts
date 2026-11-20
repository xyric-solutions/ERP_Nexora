"use client";
import { useEffect, useState } from "react";
import type { SalesOverview } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { salesPages, salesToday } from "./persistent-sales";

/** Read flags are a browser preference; documents and decisions always come from the API. */
function readPreferences(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-500) : [];
  } catch {
    return [];
  }
}
export function usePersistentSalesActivity() {
  const { api, session, activeCompany } = useSession(),
    [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ scope: string; data: SalesOverview; read: string[] } | null>(null);
  const [failedScope, setFailedScope] = useState("");
  const scope = JSON.stringify([session?.tenant_id, session?.user.id, activeCompany?.id]),
    key = `nexora.sales.activity.read.${scope}`;
  const canRead = !!session?.user.permissions.includes("sales.document.read"),
    company = activeCompany?.id;
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("nexora:sales-changed", refresh);
    return () => window.removeEventListener("nexora:sales-changed", refresh);
  }, []);
  useEffect(() => {
    if (!company || !canRead) return;
    let active = true;
    api
      .getSalesOverview(company, salesToday())
      .then((data) => {
        if (active) {
          setLoaded({ scope, data, read: readPreferences(key) });
          setFailedScope("");
        }
      })
      .catch(() => {
        if (active) {
          setLoaded(null);
          setFailedScope(scope);
        }
      });
    return () => {
      active = false;
    };
  }, [api, company, canRead, scope, key, revision]);
  const current = canRead && loaded?.scope === scope ? loaded : null;
  const notifications = (current?.data.notices ?? []).map((notice) => ({
    id: notice.id,
    recordId: notice.document_id,
    page: salesPages[notice.kind],
    code: notice.code,
    to: session?.user.display_name ?? session?.user.id ?? "",
    title: `${notice.code} ${notice.action === "submit" ? "requires review" : notice.action === "approve" ? "approved" : "rejected"}`,
    message: `${notice.actor_name} · recorded commercial ${notice.action === "submit" ? "submission" : notice.action === "approve" ? "approval" : "rejection"}`,
    tone: notice.action === "reject" ? "danger" : notice.action === "approve" ? "success" : "info",
    at: notice.at,
    read: current?.read.includes(notice.id) ?? false,
  }));
  function markRead(id: string) {
    if (!current) return;
    const read = [...new Set([...current.read, id])].slice(-500);
    try {
      localStorage.setItem(key, JSON.stringify(read));
    } catch {
      /* Read preferences remain local to this view if storage is unavailable. */
    }
    setLoaded({ ...current, read });
  }
  const counts: Record<string, number> = current?.data.navigation_counts ?? {};
  return {
    counts,
    notifications,
    markRead,
    retry: () => setRevision((value) => value + 1),
    error: canRead && failedScope === scope ? "Sales activity could not be loaded." : "",
  };
}
