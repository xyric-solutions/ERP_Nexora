"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BriefcaseBusiness, Check, Eye, ExternalLink, FileText, FileUp, Mail, Phone, Plus, RefreshCw, UserRound, type LucideIcon } from "lucide-react";
import {
  hrEmployeeDirectStatuses,
  hrEmployeeDocumentFileTypes,
  hrEmployeeDocumentMaxBytes,
  type CreateHrEmployeeContactRequest,
  type CreateHrEmployeeEmergencyContactRequest,
  type HrEmployeeEmploymentHistoryRequest,
} from "@nexora/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrRecordDrawer } from "../components/hr-record-drawer";

/** Who the drawer is for: a new draft, an unsubmitted draft, or an approved employee. */
export type HrEmployeeWizardTarget =
  | { kind: "create" }
  | { kind: "draft"; employeeId: string }
  | { kind: "employee"; employeeId: string };

type Basic = {
  companyId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  joinedOn: string;
  workEmail: string;
  phone: string;
  /** Organisation Structure units the employee is hired for: Location (division) and Project (branch). */
  locationId: string;
  projectId: string;
};
/** One row of a step list: saved rows carry a server id; edits and removals apply on Create/Save. */
type Row<T> = {
  key: string;
  serverId?: string;
  value: T;
  change: "none" | "new" | "edited" | "removed";
  /** The change a removed row had before, restored by Undo. */
  prior?: "none" | "edited";
  error?: string;
};
type Contact = { channel: "email" | "phone"; usage: "work" | "personal" | "other"; value: string; label: string; primary: boolean };
type Emergency = { name: string; relationship: string; phone: string; email: string; primary: boolean; priority: number };
type DocumentValue = {
  type: string;
  title: string;
  reference: string;
  expiresOn: string;
  /** A newly chosen file (new document or replacement). */
  file?: File;
  /** Saved file details. */
  fileName?: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  hasFile?: boolean;
};
type History = {
  company: string;
  position: string;
  startOn: string;
  endOn: string;
  skills: string;
  salary: string;
  currency: string;
  responsibilities: string;
  reasonForLeaving: string;
};

const steps = ["Basic information", "Contact information", "Documents", "Employment history"] as const;
const today = () => new Date().toISOString().slice(0, 10);
const emptyBasic = (): Basic => ({ companyId: "", firstName: "", middleName: "", lastName: "", preferredName: "", joinedOn: today(), workEmail: "", phone: "", locationId: "", projectId: "" });
const emptyContact = (): Contact => ({ channel: "phone", usage: "personal", value: "", label: "", primary: false });
const emptyEmergency = (): Emergency => ({ name: "", relationship: "", phone: "", email: "", primary: false, priority: 0 });
const emptyDocument = (): DocumentValue => ({ type: "", title: "", reference: "", expiresOn: "" });
const emptyHistory = (): History => ({ company: "", position: "", startOn: "", endOn: "", skills: "", salary: "", currency: "", responsibilities: "", reasonForLeaving: "" });
const documentTypeSuggestions = ["National ID", "Passport", "Resume / CV", "Educational certificate", "Experience letter", "Employment contract", "Medical certificate", "Other"];
const acceptedFiles = hrEmployeeDocumentFileTypes.map((type) => `.${type.extension}`).join(",");
const selectClass =
  "h-10 w-full min-w-0 rounded-[var(--nx-radius-md)] border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
/** Currency half of the joined salary field: same as selectClass, squared on the right. */
const currencySelectClass =
  "h-10 w-full min-w-0 rounded-l-[var(--nx-radius-md)] border border-r-0 border-input bg-muted px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rowKey = () => crypto.randomUUID();
const failure = (error: unknown, fallback: string) => (error instanceof ApiError && error.message ? error.message : fallback);
const fileSize = (bytes?: number | null) =>
  !bytes ? "" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const live = <T,>(rows: Row<T>[]) => rows.filter((row) => row.change !== "removed");
const pendingCount = (rows: Row<unknown>[]) => rows.filter((row) => row.change !== "none").length;

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`grid content-start min-w-0 gap-1.5 text-sm font-medium text-foreground ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

/** Small state pill on a saved row; same tokens as HrStatusPill. */
function RowPill({ tone, children }: { tone: "success" | "brand"; children: ReactNode }) {
  const toneClass =
    tone === "success"
      ? "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]"
      : "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]";
  return <span className={`shrink-0 rounded-full border px-2 text-[11px] font-semibold leading-[18px] ${toneClass}`}>{children}</span>;
}

/** Two equal columns where every row is filled; one column on narrow screens. */
const formGrid = "grid items-start gap-3.5 sm:grid-cols-2";

/** A step section: uppercase title with a rule, an optional count, then its content. */
function StepSection({ title, count, label, children }: { title: string; count?: number; label?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3.5" aria-label={label ?? title}>
      <h4 className="m-0! flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground after:h-px after:flex-1 after:bg-border">
        {title}
        {count !== undefined ? (
          <span className="rounded-full border border-border bg-muted px-1.5 text-[11px] font-semibold tracking-normal text-foreground tabular-nums">{count}</span>
        ) : null}
      </h4>
      {children}
    </section>
  );
}

/** Heading of an inline add/edit form; spans both columns. */
function FormHeading({ children }: { children: ReactNode }) {
  return <p className="m-0! text-sm font-semibold text-foreground sm:col-span-2">{children}</p>;
}

/** Last row of an add form: an option on the left (if any), actions on the right. */
function FormEnd({ start, children }: { start?: ReactNode; children: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 sm:col-span-2 ${start ? "justify-between" : "justify-end"}`}>
      {start}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** A saved or pending row with its edit/delete icons at the end. */
function ItemRow({
  icon: Icon,
  title,
  detail,
  primary = false,
  change,
  error,
  onEdit,
  onRemove,
  onUndo,
  extra,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  primary?: boolean;
  change: Row<unknown>["change"];
  error?: string;
  onEdit?: () => void;
  onRemove: () => void | Promise<boolean>;
  onUndo?: () => void;
  extra?: ReactNode;
  disabled: boolean;
}) {
  return (
    <li className={`grid gap-1 border-b border-border py-2.5 last:border-b-0 ${change === "removed" ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`m-0! truncate text-sm font-semibold ${change === "removed" ? "line-through" : ""}`}>{title}</p>
          <p className="m-0! flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{detail}</span>
            {primary ? <RowPill tone="success">Primary</RowPill> : null}
            {change === "new" ? <RowPill tone="brand">Not saved</RowPill> : null}
            {change === "edited" ? <RowPill tone="brand">Edited</RowPill> : null}
          </p>
        </div>
        {extra}
        {change === "removed" ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onUndo}>
            Undo
          </Button>
        ) : (
          <>
            {onEdit ? <HrEditButton label={`Edit ${title}`} variant="ghost" disabled={disabled} onClick={onEdit} /> : null}
            <HrConfirmDeleteButton
              label={`Delete ${title}`}
              title={`Delete ${title}?`}
              description="It is removed when you save. Saved history stays in the audit trail."
              disabled={disabled}
              onConfirm={onRemove}
            />
          </>
        )}
      </div>
      {error ? <p className="m-0! text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

function StepList<T>({ rows, empty, children }: { rows: Row<T>[]; empty: string; children: (row: Row<T>) => ReactNode }) {
  return rows.length ? (
    <ul className="m-0! list-none p-0!">{rows.map((row) => children(row))}</ul>
  ) : (
    <p className="m-0! py-2 text-sm text-muted-foreground">{empty}</p>
  );
}

/** Previews a chosen or stored file inside the drawer; HTML runs in a script-free sandbox. */
function DocumentPreview({ source, onClose }: { source: { url: string; type: string; name: string } | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const textual = !!source && ["application/json", "text/csv", "text/plain"].includes(source.type);
  useEffect(() => {
    if (!source || !textual) return;
    let active = true;
    void fetch(source.url)
      .then((response) => response.text())
      .then((value) => {
        if (active) setText(value.slice(0, 200_000));
      });
    return () => {
      active = false;
    };
  }, [source, textual]);
  if (!source) return null;
  return (
    <section className="grid gap-2 rounded-lg border border-border p-2" aria-label={`Preview of ${source.name}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="truncate text-xs font-semibold">{source.name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close preview
        </Button>
      </div>
      {source.type.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={source.url} alt={source.name} className="max-h-96 w-full rounded object-contain" />
      ) : source.type === "application/pdf" ? (
        <iframe title={source.name} src={source.url} className="h-96 w-full rounded border-0" />
      ) : source.type === "text/html" ? (
        <iframe title={source.name} src={source.url} sandbox="" className="h-96 w-full rounded border border-border bg-background" />
      ) : (
        <pre className="m-0! max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{text ?? "Loading…"}</pre>
      )}
    </section>
  );
}

export function HrEmployeeWizard({
  target,
  onClose,
  onSaved,
}: {
  target: HrEmployeeWizardTarget;
  onClose: () => void;
  /** Called after a successful Create/Save with a summary message. */
  onSaved: (message: string, employeeNumber?: string, employeeId?: string) => void;
}) {
  const { api, csrfToken, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  const [mode, setMode] = useState(target);
  const targetId = target.kind === "create" ? "" : target.employeeId;
  const employeeId = mode.kind === "create" ? "" : mode.employeeId;
  const profileEditable = mode.kind !== "employee";
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [units, setUnits] = useState<Awaited<ReturnType<HrApiClient["organizationUnits"]>>["items"]>([]);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [basic, setBasic] = useState<Basic>(emptyBasic);
  const [savedBasic, setSavedBasic] = useState<Basic | null>(null);
  /** Approved employees: Active, Probation, Confirmed or Suspended change directly; exits stay governed. */
  const [status, setStatus] = useState("");
  const [savedStatus, setSavedStatus] = useState("");
  const statusEditable = mode.kind === "employee" && (hrEmployeeDirectStatuses as readonly string[]).includes(savedStatus);
  const [contacts, setContacts] = useState<Row<Contact>[]>([]);
  const [emergency, setEmergency] = useState<Row<Emergency>[]>([]);
  const [documents, setDocuments] = useState<Row<DocumentValue>[]>([]);
  const [history, setHistory] = useState<Row<History>[]>([]);
  const [contactForm, setContactForm] = useState<{ key?: string; value: Contact }>({ value: emptyContact() });
  const [emergencyForm, setEmergencyForm] = useState<{ key?: string; value: Emergency }>({ value: emptyEmergency() });
  const [documentForm, setDocumentForm] = useState<{ key?: string; value: DocumentValue }>({ value: emptyDocument() });
  const [historyForm, setHistoryForm] = useState<{ key?: string; value: History }>({ value: emptyHistory() });
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const objectUrls = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceKey = useRef("");

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Load companies, the next employee number, and (when editing) every saved record.
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const companyList = (await client.companies()).items;
        if (!active) return;
        setCompanies(companyList);
        if (target.kind === "create") {
          const companyId = companyList[0]?.id ?? "";
          setBasic((current) => ({ ...current, companyId: current.companyId || companyId }));
          return;
        }
        const id = target.employeeId;
        const [profile, contactList, emergencyList, documentList, historyList] = await Promise.all([
          target.kind === "draft" ? client.employeeDraft(id) : client.employee(id),
          client.employeeContacts(id).catch(() => ({ items: [] })),
          client.employeeEmergencyContacts(id).catch(() => ({ items: [] })),
          client.employeeDocuments(id).catch(() => ({ items: [] })),
          client.employmentHistory(id).catch(() => ({ items: [] })),
        ]);
        if (!active) return;
        const names = "first_name" in profile ? profile : null;
        const loaded: Basic = {
          companyId: profile.company_id,
          firstName: names?.first_name ?? profile.display_name,
          middleName: names?.middle_name ?? "",
          lastName: names?.last_name ?? "",
          preferredName: profile.preferred_name ?? "",
          joinedOn: profile.joined_on,
          workEmail: profile.work_email ?? "",
          phone: profile.phone ?? "",
          locationId: ("location_id" in profile ? profile.location_id : null) ?? "",
          projectId: ("project_id" in profile ? profile.project_id : null) ?? "",
        };
        setEmployeeNumber(profile.employee_number);
        // Only approved employees carry a directly editable status; drafts are governed by approval.
        if (target.kind === "employee" && profile.status) {
          setStatus(profile.status);
          setSavedStatus(profile.status);
        }
        setBasic(loaded);
        setSavedBasic(loaded);
        setContacts(
          contactList.items.map((item) => ({
            key: rowKey(),
            serverId: item.id,
            change: "none",
            value: { channel: item.channel, usage: item.contact_usage, value: item.contact_value, label: item.label, primary: item.is_primary },
          })),
        );
        setEmergency(
          emergencyList.items.map((item) => ({
            key: rowKey(),
            serverId: item.id,
            change: "none",
            value: { name: item.name, relationship: item.relationship, phone: item.phone, email: item.email, primary: item.is_primary, priority: item.priority },
          })),
        );
        setDocuments(
          documentList.items
            .filter((item) => item.status === "active")
            .map((item) => ({
              key: rowKey(),
              serverId: item.id,
              change: "none",
              value: {
                type: item.document_type,
                title: item.title,
                reference: item.reference,
                expiresOn: item.expires_on ?? "",
                fileName: item.file_name ?? undefined,
                contentType: item.content_type,
                sizeBytes: item.size_bytes,
                hasFile: item.has_file,
              },
            })),
        );
        setHistory(
          historyList.items.map((item) => ({
            key: rowKey(),
            serverId: item.id,
            change: "none",
            value: {
              company: item.company_name,
              position: item.job_title,
              startOn: item.start_on,
              endOn: item.end_on ?? "",
              skills: item.skills.join(", "),
              salary: item.last_salary ?? "",
              currency: item.salary_currency ?? "",
              responsibilities: item.responsibilities,
              reasonForLeaving: item.reason_for_leaving,
            },
          })),
        );
      } catch (cause) {
        if (active) setError(failure(cause, "The employee record could not be loaded."));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // Loaded once per opened record (callers pass a new target object each render); after Create
    // the drawer keeps its own state for the new draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, target.kind, targetId]);

  // The automatic number preview and salary currencies follow the selected company.
  useEffect(() => {
    if (!basic.companyId) return;
    let active = true;
    if (mode.kind === "create")
      client
        .employeeNumberPreview(basic.companyId)
        .then((result) => active && setEmployeeNumber(result.employee_number))
        .catch(() => active && setEmployeeNumber(""));
    client
      .jobGradeCurrencies(basic.companyId)
      .then((result) => active && setCurrencies(result.items.map((item) => item.currency_code)))
      .catch(() => active && setCurrencies([]));
    return () => {
      active = false;
    };
  }, [basic.companyId, client, mode.kind]);

  // Locations and projects come from Organisation Structure for the selected company.
  useEffect(() => {
    if (!basic.companyId || mode.kind === "employee") return;
    let active = true;
    // An unavailable structure only leaves the two pickers empty; the form still saves.
    Promise.resolve()
      .then(() => client.organizationUnits({ companyId: basic.companyId, limit: 200 }))
      .then((result) => active && setUnits(result.items.filter((unit) => unit.status === "active" && (unit.type === "division" || unit.type === "branch"))))
      .catch(() => active && setUnits([]));
    return () => {
      active = false;
    };
  }, [basic.companyId, client, mode.kind]);
  const locations = units.filter((unit) => unit.type === "division");
  const projects = units.filter((unit) => unit.type === "branch" && (!basic.locationId || unit.parent_id === basic.locationId));

  /** Only what the server needs to save the employee; every other field is optional. */
  const basicErrors = () => {
    const problems: string[] = [];
    if (!basic.companyId) problems.push("company");
    if (!basic.firstName.trim()) problems.push("first name");
    if (!basic.lastName.trim()) problems.push("last name");
    if (basic.workEmail.trim() && !emailPattern.test(basic.workEmail.trim())) problems.push("a valid email");
    return problems;
  };
  const goTo = (next: number) => {
    setStep(Math.max(0, Math.min(steps.length - 1, next)));
  };

  const upsert = <T,>(rows: Row<T>[], key: string | undefined, value: T): Row<T>[] =>
    key
      ? rows.map((row) => (row.key === key ? { ...row, value, change: row.serverId ? "edited" : "new", error: undefined } : row))
      : [...rows, { key: rowKey(), value, change: "new" }];
  const remove = <T,>(rows: Row<T>[], key: string): Row<T>[] =>
    rows.flatMap((row) =>
      row.key !== key
        ? [row]
        : row.serverId
          ? [{ ...row, change: "removed" as const, prior: row.change === "edited" ? ("edited" as const) : ("none" as const) }]
          : [],
    );
  const undo = <T,>(rows: Row<T>[], key: string): Row<T>[] =>
    rows.map((row) => (row.key === key ? { ...row, change: row.prior ?? "none", prior: undefined } : row));

  const openPreview = async (row: Row<DocumentValue>) => {
    try {
      const file = row.value.file;
      const blob = file ?? (row.serverId ? await client.downloadEmployeeDocument(employeeId, row.serverId) : null);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      setPreview({ url, type: file?.type || row.value.contentType || blob.type, name: file?.name ?? row.value.fileName ?? row.value.title });
    } catch (cause) {
      setError(failure(cause, "The document could not be previewed."));
    }
  };
  const openInTab = (row: Row<DocumentValue>) => {
    if (row.value.file) {
      const url = URL.createObjectURL(row.value.file);
      objectUrls.current.push(url);
      window.open(url, "_blank", "noopener");
    } else if (row.serverId) window.open(client.employeeDocumentUrl(employeeId, row.serverId), "_blank", "noopener");
  };
  const checkFile = (file: File) => {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (!hrEmployeeDocumentFileTypes.some((type) => type.extension === extension))
      return "Choose a PDF, HTML, JPEG, PNG, JSON, CSV or text file.";
    if (file.size > hrEmployeeDocumentMaxBytes) return "Files can be at most 10 MB.";
    if (file.size === 0) return "The file is empty.";
    return "";
  };

  /** Applies every pending change; failed rows keep their changes and show why. */
  const save = async () => {
    if (busy) return;
    if (profileEditable && basicErrors().length) {
      setStep(0);
      setError(`Add ${basicErrors().join(", ")} to save the employee.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    let id = employeeId;
    let number = employeeNumber;
    const failures: string[] = [];
    try {
      if (mode.kind === "create") {
        const created = await client.createEmployeeDraft(
          {
            company_id: basic.companyId,
            employee_number: "AUTO",
            first_name: basic.firstName.trim(),
            last_name: basic.lastName.trim(),
            joined_on: basic.joinedOn || today(),
            ...(basic.middleName.trim() ? { middle_name: basic.middleName.trim() } : {}),
            ...(basic.preferredName.trim() ? { preferred_name: basic.preferredName.trim() } : {}),
            ...(basic.workEmail.trim() ? { work_email: basic.workEmail.trim() } : {}),
            ...(basic.phone.trim() ? { phone: basic.phone.trim() } : {}),
            ...(basic.locationId ? { location_id: basic.locationId } : {}),
            ...(basic.projectId ? { project_id: basic.projectId } : {}),
          },
          csrfToken(),
          crypto.randomUUID(),
        );
        id = created.id;
        number = created.employee_number;
        setEmployeeNumber(number);
        // From here on the drawer edits the saved draft, so a retry never creates a second one.
        setMode({ kind: "draft", employeeId: id });
        setSavedBasic(basic);
      } else if (mode.kind === "draft" && savedBasic) {
        const changes = {
          ...(basic.firstName.trim() !== savedBasic.firstName ? { first_name: basic.firstName.trim() } : {}),
          ...(basic.middleName.trim() !== savedBasic.middleName ? { middle_name: basic.middleName.trim() } : {}),
          ...(basic.lastName.trim() !== savedBasic.lastName ? { last_name: basic.lastName.trim() } : {}),
          ...(basic.preferredName.trim() !== savedBasic.preferredName ? { preferred_name: basic.preferredName.trim() } : {}),
          ...(basic.joinedOn !== savedBasic.joinedOn ? { joined_on: basic.joinedOn } : {}),
          ...(basic.workEmail.trim() !== savedBasic.workEmail && basic.workEmail.trim() ? { work_email: basic.workEmail.trim() } : {}),
          ...(basic.phone.trim() !== savedBasic.phone ? { phone: basic.phone.trim() } : {}),
          ...(basic.locationId !== savedBasic.locationId ? { location_id: basic.locationId || null } : {}),
          ...(basic.projectId !== savedBasic.projectId ? { project_id: basic.projectId || null } : {}),
        };
        if (Object.keys(changes).length) {
          await client.updateEmployeeDraft(id, changes, csrfToken(), crypto.randomUUID());
          setSavedBasic(basic);
        }
      }
      if (statusEditable && status !== savedStatus) {
        await client.changeEmployeeStatus(id, { status: status as (typeof hrEmployeeDirectStatuses)[number], reason: "" }, csrfToken(), crypto.randomUUID());
        setSavedStatus(status);
      }
    } catch (cause) {
      setBusy(false);
      setStep(0);
      setError(failure(cause, "The employee could not be saved. Check the basic information and try again."));
      return;
    }

    // Each step's rows: removals first, then edits and additions.
    const apply = async <T,>(
      rows: Row<T>[],
      setRows: (rows: Row<T>[]) => void,
      label: string,
      handlers: { create: (value: T) => Promise<{ id: string }>; update?: (serverId: string, value: T) => Promise<{ id: string }>; remove: (serverId: string) => Promise<unknown> },
    ) => {
      const next: Row<T>[] = [];
      const ordered = [...rows].sort((a, b) => Number(b.change === "removed") - Number(a.change === "removed"));
      for (const row of ordered) {
        try {
          if (row.change === "removed" && row.serverId) await handlers.remove(row.serverId);
          else if (row.change === "new") next.push({ ...row, serverId: (await handlers.create(row.value)).id, change: "none", error: undefined });
          else if (row.change === "edited" && row.serverId && handlers.update)
            next.push({ ...row, serverId: (await handlers.update(row.serverId, row.value)).id, change: "none", error: undefined });
          else if (row.change !== "removed") next.push(row);
        } catch (cause) {
          const message = failure(cause, `This ${label} could not be saved.`);
          failures.push(label);
          next.push({ ...row, error: message });
        }
      }
      setRows(rows.map((row) => next.find((item) => item.key === row.key)).filter((row): row is Row<T> => Boolean(row)));
    };
    const contactInput = (value: Contact): CreateHrEmployeeContactRequest => ({
      channel: value.channel,
      contact_usage: value.usage,
      contact_value: value.value.trim(),
      label: value.label.trim(),
      is_primary: value.primary,
    });
    // Removals run first, so only rows that stay keep their priority.
    const usedPriorities = new Set(live(emergency).map((row) => row.value.priority).filter((priority) => priority > 0));
    const nextPriority = () => {
      let priority = 1;
      while (usedPriorities.has(priority)) priority += 1;
      usedPriorities.add(priority);
      return priority;
    };
    const emergencyInput = (value: Emergency): CreateHrEmployeeEmergencyContactRequest => ({
      name: value.name.trim(),
      relationship: value.relationship.trim(),
      phone: value.phone.trim(),
      ...(value.email.trim() ? { email: value.email.trim() } : {}),
      priority: value.priority || nextPriority(),
      is_primary: value.primary,
    });
    const historyInput = (value: History): HrEmployeeEmploymentHistoryRequest => ({
      company_name: value.company.trim(),
      job_title: value.position.trim(),
      start_on: value.startOn,
      ...(value.endOn ? { end_on: value.endOn } : {}),
      skills: value.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
      ...(value.salary.trim() ? { last_salary: value.salary.trim(), salary_currency: value.currency } : {}),
      responsibilities: value.responsibilities.trim(),
      reason_for_leaving: value.reasonForLeaving.trim(),
    });
    const key = () => crypto.randomUUID();
    await apply(contacts, setContacts, "contact", {
      create: (value) => client.createEmployeeContact(id, contactInput(value), csrfToken(), key()),
      update: (serverId, value) => client.updateEmployeeContact(id, serverId, contactInput(value), csrfToken(), key()),
      remove: (serverId) => client.removeEmployeeContact(id, serverId, csrfToken(), key()),
    });
    await apply(emergency, setEmergency, "emergency contact", {
      create: (value) => client.createEmployeeEmergencyContact(id, emergencyInput(value), csrfToken(), key()),
      update: (serverId, value) => client.updateEmployeeEmergencyContact(id, serverId, emergencyInput(value), csrfToken(), key()),
      remove: (serverId) => client.removeEmployeeEmergencyContact(id, serverId, csrfToken(), key()),
    });
    await apply(documents, setDocuments, "document", {
      create: (value) =>
        client.uploadEmployeeDocument(
          id,
          { document_type: value.type.trim(), title: value.title.trim(), reference: value.reference.trim(), ...(value.expiresOn ? { expires_on: value.expiresOn } : {}) },
          value.file!,
          csrfToken(),
          key(),
        ),
      // A metadata-only edit re-files the stored document under a replacement; a new file replaces it.
      update: async (serverId, value) => {
        const file = value.file ?? new File([await client.downloadEmployeeDocument(id, serverId)], value.fileName ?? "document", { type: value.contentType ?? undefined });
        return client.uploadEmployeeDocument(
          id,
          { document_type: value.type.trim(), title: value.title.trim(), reference: value.reference.trim(), ...(value.expiresOn ? { expires_on: value.expiresOn } : {}) },
          file,
          csrfToken(),
          key(),
          serverId,
        );
      },
      remove: (serverId) => client.removeEmployeeDocument(id, serverId, csrfToken(), key()),
    });
    await apply(history, setHistory, "employment history entry", {
      create: (value) => client.saveEmploymentHistory(id, undefined, historyInput(value), csrfToken(), key()),
      update: (serverId, value) => client.saveEmploymentHistory(id, serverId, historyInput(value), csrfToken(), key()),
      remove: (serverId) => client.removeEmploymentHistory(id, serverId, csrfToken(), key()),
    });
    setBusy(false);
    if (failures.length) {
      setError(
        `${number || "The employee"} was saved, but ${failures.length} item${failures.length === 1 ? "" : "s"} need attention: ${[...new Set(failures)].join(", ")}. Fix the highlighted rows and save again.`,
      );
      return;
    }
    const message =
      target.kind === "create"
        ? `Employee draft ${number} was created with all entered details. It stays inactive until it is submitted and approved.`
        : `${number} was saved.`;
    onSaved(message, number, id);
  };

  const pending =
    pendingCount(contacts) + pendingCount(emergency) + pendingCount(documents) + pendingCount(history) +
    (savedBasic && profileEditable && JSON.stringify(basic) !== JSON.stringify(savedBasic) ? 1 : 0) +
    (statusEditable && status !== savedStatus ? 1 : 0);
  const contactsReadOnly = mode.kind !== "create" && !can("hr.employee_contact.manage");
  const emergencyReadOnly = mode.kind !== "create" && !can("hr.employee_emergency_contact.manage");
  const readOnlyRecords =
    (contactsReadOnly && emergencyReadOnly && step === 1) ||
    (!can("hr.employee_document.manage") && step === 2) ||
    (!can("hr.employee.update") && mode.kind !== "create" && step === 3);
  const title = target.kind === "create" ? "Add Employee" : [basic.firstName, basic.lastName].filter(Boolean).join(" ") || "Employee";

  const footer = (
    <>
      <Button type="button" variant="outline" disabled={busy || step === 0} onClick={() => goTo(step - 1)}>
        Previous
      </Button>
      {step < steps.length - 1 ? (
        <Button type="button" variant={mode.kind === "create" ? "default" : "outline"} disabled={busy || loading} onClick={() => goTo(step + 1)}>
          Next
        </Button>
      ) : null}
      {mode.kind === "create" ? (
        step === steps.length - 1 ? (
          <Button type="button" disabled={busy || loading || !can("hr.employee.create")} onClick={() => void save()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        ) : null
      ) : (
        <Button type="button" disabled={busy || loading || pending === 0} onClick={() => void save()}>
          {busy ? "Saving…" : pending ? `Save changes (${pending})` : "Saved"}
        </Button>
      )}
    </>
  );

  return (
    <HrRecordDrawer title={title} open onClose={onClose} busy={busy} error={error} notice={notice} footer={footer} description="Employee record in four steps.">
      {loading ? (
        <div className="grid gap-3" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span>Employee number</span>
            <span aria-readonly className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[12.5px] font-semibold text-foreground">
              {employeeNumber || "Generated on create"}
            </span>
            {mode.kind !== "create" ? <Badge variant="outline">{mode.kind === "draft" ? "Draft" : "Approved employee"}</Badge> : null}
          </div>
          <ol className="-mx-6! my-0! grid list-none grid-cols-4 border-y border-border px-6! py-3.5!" aria-label="Steps">
            {steps.map((label, index) => (
              <li
                key={label}
                className={`relative min-w-0 ${index ? `before:absolute before:top-[15px] before:right-[calc(50%+18px)] before:left-[calc(-50%+18px)] before:h-0.5 before:rounded-full ${index <= step ? "before:bg-primary" : "before:bg-border"}` : ""}`}
              >
                <button
                  type="button"
                  disabled={busy}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => goTo(index)}
                  className={`group grid w-full min-w-0 cursor-pointer appearance-none justify-items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-center font-sans text-[12px]! leading-tight! focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60 ${index === step ? "font-semibold! text-foreground" : "font-normal! text-muted-foreground"}`}
                >
                  <span
                    className={`relative z-10 grid size-[30px] place-items-center rounded-full border-[1.5px] border-solid text-[12.5px] font-semibold transition group-hover:border-primary ${
                      index < step
                        ? "border-primary bg-primary text-primary-foreground"
                        : index === step
                          ? "border-primary bg-card text-foreground ring-4 ring-[var(--nx-brand-soft)]"
                          : "border-[var(--nx-border-strong)] bg-card text-muted-foreground"
                    }`}
                  >
                    {index < step ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="hidden whitespace-nowrap sm:block">{label}</span>
                </button>
              </li>
            ))}
          </ol>

          {readOnlyRecords ? (
            <Alert>
              <AlertDescription>Your role can view these records but not change them.</AlertDescription>
            </Alert>
          ) : null}

          {step === 0 ? (
            profileEditable ? (
              <div className={formGrid}>
                <Field label="Company">
                  <select
                    className={selectClass}
                    disabled={busy || mode.kind !== "create"}
                    value={basic.companyId}
                    onChange={(event) => setBasic({ ...basic, companyId: event.target.value, locationId: "", projectId: "" })}
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} ({company.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Location">
                  <select
                    className={selectClass}
                    disabled={busy}
                    value={basic.locationId}
                    onChange={(event) => {
                      const locationId = event.target.value;
                      const project = units.find((unit) => unit.id === basic.projectId);
                      // A project from another location no longer applies.
                      setBasic({ ...basic, locationId, projectId: project && locationId && project.parent_id !== locationId ? "" : basic.projectId });
                    }}
                  >
                    <option value="">{locations.length ? "Select a location" : "No locations in Organisation Structure"}</option>
                    {locations.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Project">
                  <select
                    className={selectClass}
                    disabled={busy}
                    value={basic.projectId}
                    onChange={(event) => {
                      const projectId = event.target.value;
                      const project = units.find((unit) => unit.id === projectId);
                      // Choosing a project also fills in the location it belongs to.
                      const parent = project && locations.find((unit) => unit.id === project.parent_id);
                      setBasic({ ...basic, projectId, locationId: parent ? parent.id : basic.locationId });
                    }}
                  >
                    <option value="">{projects.length ? "Select a project" : basic.locationId ? "No projects under this location" : "No projects in Organisation Structure"}</option>
                    {projects.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Joining date">
                  <Input required type="date" disabled={busy} value={basic.joinedOn} onChange={(event) => setBasic({ ...basic, joinedOn: event.target.value })} />
                </Field>
                <Field label="First name">
                  <Input required maxLength={100} disabled={busy} value={basic.firstName} onChange={(event) => setBasic({ ...basic, firstName: event.target.value })} />
                </Field>
                <Field label="Middle name">
                  <Input maxLength={100} disabled={busy} value={basic.middleName} onChange={(event) => setBasic({ ...basic, middleName: event.target.value })} />
                </Field>
                <Field label="Last name">
                  <Input required maxLength={100} disabled={busy} value={basic.lastName} onChange={(event) => setBasic({ ...basic, lastName: event.target.value })} />
                </Field>
                <Field label="Preferred name">
                  <Input maxLength={100} disabled={busy} value={basic.preferredName} onChange={(event) => setBasic({ ...basic, preferredName: event.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" maxLength={320} disabled={busy} value={basic.workEmail} onChange={(event) => setBasic({ ...basic, workEmail: event.target.value })} />
                </Field>
                <Field label="Phone number">
                  <Input maxLength={40} disabled={busy} value={basic.phone} onChange={(event) => setBasic({ ...basic, phone: event.target.value })} />
                </Field>
              </div>
            ) : (
              <div className="grid gap-3">
                <dl className="m-0! grid">
                  {[
                    ["Name", [basic.firstName, basic.middleName, basic.lastName].filter(Boolean).join(" ")],
                    ["Preferred name", basic.preferredName],
                    ["Email", basic.workEmail],
                    ["Phone number", basic.phone],
                    ["Joining date", basic.joinedOn],
                    ["Company", companies.find((company) => company.id === basic.companyId)?.name ?? ""],
                    ...(statusEditable ? [] : [["Status", savedStatus.replaceAll("_", " ")]]),
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[minmax(7.5rem,36%)_minmax(0,1fr)] gap-3 py-2">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="m-0! text-sm font-medium">{value || "Not recorded"}</dd>
                    </div>
                  ))}
                </dl>
                {statusEditable ? (
                  <Field label="Status">
                    <select className={selectClass} disabled={busy || !can("hr.employee.update")} value={status} onChange={(event) => setStatus(event.target.value)}>
                      {hrEmployeeDirectStatuses.map((value) => (
                        <option key={value} value={value}>
                          {value.charAt(0).toUpperCase() + value.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            )
          ) : null}

          {step === 1 ? (
            <StepSection title="Contacts" count={contacts.length}>
              <StepList rows={contacts} empty="No additional contacts yet.">
                {(row) => (
                  <ItemRow
                    key={row.key}
                    icon={row.value.channel === "email" ? Mail : Phone}
                    title={row.value.value}
                    detail={`${row.value.channel === "email" ? "Email" : "Phone"} · ${row.value.usage.charAt(0).toUpperCase()}${row.value.usage.slice(1)}${row.value.label ? ` · ${row.value.label}` : ""}`}
                    primary={row.value.primary}
                    change={row.change}
                    error={row.error}
                    disabled={busy || contactsReadOnly}
                    onEdit={() => setContactForm({ key: row.key, value: row.value })}
                    onRemove={() => setContacts(remove(contacts, row.key))}
                    onUndo={() => setContacts(undo(contacts, row.key))}
                  />
                )}
              </StepList>
              {!contactsReadOnly ? (
                <div className={formGrid} role="group" aria-label={contactForm.key ? "Edit contact" : "Add contact"}>
                  <FormHeading>{contactForm.key ? "Edit contact" : "Add contact"}</FormHeading>
                  <div className="grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground">
                    <span id="hr-wizard-contact-type">Type</span>
                    <div role="radiogroup" aria-labelledby="hr-wizard-contact-type" className="grid h-10 grid-cols-2 rounded-[10px] border border-input bg-muted p-[3px]">
                      {(
                        [
                          ["phone", "Phone", Phone],
                          ["email", "Email", Mail],
                        ] as const
                      ).map(([value, text, Icon]) => {
                        const on = contactForm.value.channel === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={busy}
                            onClick={() => setContactForm({ ...contactForm, value: { ...contactForm.value, channel: value } })}
                            className={`inline-flex cursor-pointer appearance-none items-center justify-center gap-1.5 rounded-[7px] border-0 p-0 font-sans text-sm! transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-card font-semibold! text-foreground shadow-sm" : "bg-transparent font-medium! text-muted-foreground hover:text-foreground"}`}
                          >
                            <Icon className="size-3.5" />
                            {text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Field label="Usage">
                    <select className={selectClass} value={contactForm.value.usage} onChange={(event) => setContactForm({ ...contactForm, value: { ...contactForm.value, usage: event.target.value as Contact["usage"] } })}>
                      <option value="personal">Personal</option>
                      <option value="work">Work</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label={contactForm.value.channel === "email" ? "Email address" : "Phone number"}>
                    <Input maxLength={320} type={contactForm.value.channel === "email" ? "email" : "tel"} value={contactForm.value.value} onChange={(event) => setContactForm({ ...contactForm, value: { ...contactForm.value, value: event.target.value } })} />
                  </Field>
                  <Field label="Label">
                    <Input maxLength={100} placeholder="Mobile, home, LinkedIn…" value={contactForm.value.label} onChange={(event) => setContactForm({ ...contactForm, value: { ...contactForm.value, label: event.target.value } })} />
                  </Field>
                  <FormEnd
                    start={
                      <label htmlFor="hr-wizard-contact-primary" className="flex items-center gap-2 text-sm">
                        <Checkbox id="hr-wizard-contact-primary" checked={contactForm.value.primary} onCheckedChange={(checked) => setContactForm({ ...contactForm, value: { ...contactForm.value, primary: Boolean(checked) } })} />
                        Primary contact of this type
                      </label>
                    }
                  >
                    {contactForm.key ? (
                      <Button type="button" variant="ghost" onClick={() => setContactForm({ value: emptyContact() })}>
                        Cancel edit
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !contactForm.value.value.trim() || (contactForm.value.channel === "email" && !emailPattern.test(contactForm.value.value.trim()))}
                      onClick={() => {
                        setContacts(upsert(contacts, contactForm.key, contactForm.value));
                        setContactForm({ value: emptyContact() });
                      }}
                    >
                      <Plus className="size-4" />
                      {contactForm.key ? "Update contact" : "Add contact"}
                    </Button>
                  </FormEnd>
                </div>
              ) : null}
            </StepSection>
          ) : null}

          {step === 1 ? (
            <StepSection title="Emergency contacts" count={emergency.length}>
              <StepList rows={emergency} empty="No emergency contacts yet.">
                {(row) => (
                  <ItemRow
                    key={row.key}
                    icon={UserRound}
                    title={row.value.name}
                    detail={`${row.value.relationship} · ${row.value.phone}${row.value.email ? ` · ${row.value.email}` : ""}`}
                    primary={row.value.primary}
                    change={row.change}
                    error={row.error}
                    disabled={busy || emergencyReadOnly}
                    onEdit={() => setEmergencyForm({ key: row.key, value: row.value })}
                    onRemove={() => setEmergency(remove(emergency, row.key))}
                    onUndo={() => setEmergency(undo(emergency, row.key))}
                  />
                )}
              </StepList>
              {!emergencyReadOnly ? (
                <div className={formGrid} role="group" aria-label={emergencyForm.key ? "Edit emergency contact" : "Add emergency contact"}>
                  <FormHeading>{emergencyForm.key ? "Edit emergency contact" : "Add emergency contact"}</FormHeading>
                  <Field label="Contact name">
                    <Input maxLength={160} value={emergencyForm.value.name} onChange={(event) => setEmergencyForm({ ...emergencyForm, value: { ...emergencyForm.value, name: event.target.value } })} />
                  </Field>
                  <Field label="Relationship">
                    <Input maxLength={80} list="hr-emergency-relationships" placeholder="Spouse, parent, sibling…" value={emergencyForm.value.relationship} onChange={(event) => setEmergencyForm({ ...emergencyForm, value: { ...emergencyForm.value, relationship: event.target.value } })} />
                    <datalist id="hr-emergency-relationships">
                      {["Spouse", "Parent", "Sibling", "Child", "Relative", "Friend"].map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Phone number">
                    <Input maxLength={40} type="tel" value={emergencyForm.value.phone} onChange={(event) => setEmergencyForm({ ...emergencyForm, value: { ...emergencyForm.value, phone: event.target.value } })} />
                  </Field>
                  <Field label="Email">
                    <Input maxLength={320} type="email" value={emergencyForm.value.email} onChange={(event) => setEmergencyForm({ ...emergencyForm, value: { ...emergencyForm.value, email: event.target.value } })} />
                  </Field>
                  <FormEnd
                    start={
                      <label htmlFor="hr-wizard-emergency-primary" className="flex items-center gap-2 text-sm">
                        <Checkbox id="hr-wizard-emergency-primary" checked={emergencyForm.value.primary} onCheckedChange={(checked) => setEmergencyForm({ ...emergencyForm, value: { ...emergencyForm.value, primary: Boolean(checked) } })} />
                        Primary emergency contact
                      </label>
                    }
                  >
                    {emergencyForm.key ? (
                      <Button type="button" variant="ghost" onClick={() => setEmergencyForm({ value: emptyEmergency() })}>
                        Cancel edit
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        busy ||
                        !emergencyForm.value.name.trim() ||
                        !emergencyForm.value.relationship.trim() ||
                        !emergencyForm.value.phone.trim() ||
                        (!!emergencyForm.value.email.trim() && !emailPattern.test(emergencyForm.value.email.trim()))
                      }
                      onClick={() => {
                        setEmergency(upsert(emergency, emergencyForm.key, emergencyForm.value));
                        setEmergencyForm({ value: emptyEmergency() });
                      }}
                    >
                      <Plus className="size-4" />
                      {emergencyForm.key ? "Update emergency contact" : "Add emergency contact"}
                    </Button>
                  </FormEnd>
                </div>
              ) : null}
            </StepSection>
          ) : null}

          {step === 2 ? (
            <StepSection title="Documents" count={documents.length}>
              <input
                ref={replaceInput}
                type="file"
                hidden
                accept={acceptedFiles}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const problem = checkFile(file);
                  if (problem) {
                    setError(problem);
                    return;
                  }
                  setError("");
                  setDocuments(
                    documents.map((row) =>
                      row.key === replaceKey.current
                        ? { ...row, value: { ...row.value, file, fileName: file.name, contentType: file.type, sizeBytes: file.size }, change: row.serverId ? "edited" : "new", error: undefined }
                        : row,
                    ),
                  );
                }}
              />
              <StepList rows={documents} empty="No documents yet.">
                {(row) => (
                  <ItemRow
                    key={row.key}
                    icon={FileText}
                    title={row.value.title}
                    detail={`${row.value.type}${row.value.fileName ? ` · ${row.value.fileName}` : ""}${row.value.sizeBytes ? ` · ${fileSize(row.value.sizeBytes)}` : ""}${row.value.expiresOn ? ` · expires ${row.value.expiresOn}` : ""}`}
                    change={row.change}
                    error={row.error}
                    disabled={busy || readOnlyRecords}
                    onEdit={() => setDocumentForm({ key: row.key, value: row.value })}
                    onRemove={() => setDocuments(remove(documents, row.key))}
                    onUndo={() => setDocuments(undo(documents, row.key))}
                    extra={
                      row.change !== "removed" && (row.value.file || row.value.hasFile) ? (
                        <>
                          <Button type="button" size="icon" variant="ghost" aria-label={`Preview ${row.value.title}`} title="Preview" disabled={busy} onClick={() => void openPreview(row)}>
                            <Eye />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Open ${row.value.title}`}
                            title={row.value.file && row.value.file.type === "text/html" ? "Save the document first to open HTML in a tab" : "Open in a new tab"}
                            disabled={busy || (!!row.value.file && row.value.file.type === "text/html")}
                            onClick={() => openInTab(row)}
                          >
                            <ExternalLink />
                          </Button>
                          {!readOnlyRecords ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Replace ${row.value.title}`}
                              title="Replace file"
                              disabled={busy}
                              onClick={() => {
                                replaceKey.current = row.key;
                                replaceInput.current?.click();
                              }}
                            >
                              <RefreshCw />
                            </Button>
                          ) : null}
                        </>
                      ) : null
                    }
                  />
                )}
              </StepList>
              <DocumentPreview source={preview} onClose={() => setPreview(null)} />
              {!readOnlyRecords ? (
                <div className={formGrid} role="group" aria-label={documentForm.key ? "Edit document" : "Upload document"}>
                  <FormHeading>{documentForm.key ? "Edit document" : "Upload document"}</FormHeading>
                  <div className="flex min-w-0 items-center gap-3 rounded-[10px] bg-muted p-3 sm:col-span-2">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-background text-muted-foreground">
                        <FileUp className="size-4" />
                      </span>
                      <input
                        ref={fileInput}
                        type="file"
                        accept={acceptedFiles}
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          const problem = checkFile(file);
                          if (problem) {
                            setError(problem);
                            return;
                          }
                          setError("");
                          setDocumentForm({
                            ...documentForm,
                            value: {
                              ...documentForm.value,
                              file,
                              fileName: file.name,
                              contentType: file.type,
                              sizeBytes: file.size,
                              title: documentForm.value.title || file.name.replace(/\.[^.]+$/, ""),
                            },
                          });
                        }}
                      />
                      <span className={`min-w-0 flex-1 truncate text-sm ${documentForm.value.fileName ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {documentForm.value.fileName ? `${documentForm.value.fileName} · ${fileSize(documentForm.value.sizeBytes)}` : "No file chosen"}
                      </span>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                        {documentForm.value.fileName ? "Choose another file" : "Choose file"}
                      </Button>
                  </div>
                  <Field label="Document type">
                    <Input maxLength={80} list="hr-document-types" value={documentForm.value.type} onChange={(event) => setDocumentForm({ ...documentForm, value: { ...documentForm.value, type: event.target.value } })} />
                    <datalist id="hr-document-types">
                      {documentTypeSuggestions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Title">
                    <Input maxLength={200} value={documentForm.value.title} onChange={(event) => setDocumentForm({ ...documentForm, value: { ...documentForm.value, title: event.target.value } })} />
                  </Field>
                  <Field label="Reference number">
                    <Input maxLength={120} value={documentForm.value.reference} onChange={(event) => setDocumentForm({ ...documentForm, value: { ...documentForm.value, reference: event.target.value } })} />
                  </Field>
                  <Field label="Expiry date">
                    <Input type="date" value={documentForm.value.expiresOn} onChange={(event) => setDocumentForm({ ...documentForm, value: { ...documentForm.value, expiresOn: event.target.value } })} />
                  </Field>
                  <FormEnd>
                    {documentForm.key ? (
                      <Button type="button" variant="ghost" onClick={() => setDocumentForm({ value: emptyDocument() })}>
                        Cancel edit
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !documentForm.value.type.trim() || !documentForm.value.title.trim() || (!documentForm.value.file && !documentForm.value.hasFile)}
                      onClick={() => {
                        setDocuments(upsert(documents, documentForm.key, documentForm.value));
                        setDocumentForm({ value: emptyDocument() });
                      }}
                    >
                      <Plus className="size-4" />
                      {documentForm.key ? "Update document" : "Add document"}
                    </Button>
                  </FormEnd>
                </div>
              ) : null}
            </StepSection>
          ) : null}

          {step === 3 ? (
            <StepSection title="Previous employment" count={history.length}>
              <StepList rows={history} empty="No previous employment yet.">
                {(row) => (
                  <ItemRow
                    key={row.key}
                    icon={BriefcaseBusiness}
                    title={`${row.value.position} · ${row.value.company}`}
                    detail={`${row.value.startOn} – ${row.value.endOn || "present"}${row.value.salary ? ` · ${row.value.currency} ${row.value.salary}` : ""}${row.value.skills ? ` · ${row.value.skills}` : ""}`}
                    change={row.change}
                    error={row.error}
                    disabled={busy || readOnlyRecords}
                    onEdit={() => setHistoryForm({ key: row.key, value: row.value })}
                    onRemove={() => setHistory(remove(history, row.key))}
                    onUndo={() => setHistory(undo(history, row.key))}
                  />
                )}
              </StepList>
              {!readOnlyRecords ? (
                <div className={formGrid} role="group" aria-label={historyForm.key ? "Edit previous employment" : "Add previous employment"}>
                  <FormHeading>{historyForm.key ? "Edit previous employment" : "Add previous employment"}</FormHeading>
                  <Field label="Previous company">
                    <Input maxLength={200} value={historyForm.value.company} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, company: event.target.value } })} />
                  </Field>
                  <Field label="Job position">
                    <Input maxLength={160} value={historyForm.value.position} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, position: event.target.value } })} />
                  </Field>
                  <Field label="Start date">
                    <Input type="date" value={historyForm.value.startOn} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, startOn: event.target.value } })} />
                  </Field>
                  <Field label="End date">
                    <Input type="date" min={historyForm.value.startOn || undefined} value={historyForm.value.endOn} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, endOn: event.target.value } })} />
                  </Field>
                  <div className="grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground">
                    <span id="hr-wizard-history-salary">Previous salary</span>
                    <div className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)]">
                      <select
                        aria-label="Salary currency"
                        className={currencySelectClass}
                        value={historyForm.value.currency}
                        onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, currency: event.target.value } })}
                      >
                        <option value="">{currencies.length ? "Currency" : "None"}</option>
                        {[...new Set([...currencies, ...(historyForm.value.currency ? [historyForm.value.currency] : [])])].map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-labelledby="hr-wizard-history-salary"
                        inputMode="decimal"
                        className="rounded-l-none"
                        value={historyForm.value.salary}
                        onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, salary: event.target.value } })}
                      />
                    </div>
                  </div>
                  <Field label="Skills">
                    <Input value={historyForm.value.skills} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, skills: event.target.value } })} />
                  </Field>
                  <Field label="Responsibilities and experience" wide>
                    <Textarea maxLength={2000} value={historyForm.value.responsibilities} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, responsibilities: event.target.value } })} />
                  </Field>
                  <Field label="Reason for leaving" wide>
                    <Input maxLength={500} value={historyForm.value.reasonForLeaving} onChange={(event) => setHistoryForm({ ...historyForm, value: { ...historyForm.value, reasonForLeaving: event.target.value } })} />
                  </Field>
                  <FormEnd>
                    {historyForm.key ? (
                      <Button type="button" variant="ghost" onClick={() => setHistoryForm({ value: emptyHistory() })}>
                        Cancel edit
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        busy ||
                        !historyForm.value.company.trim() ||
                        !historyForm.value.position.trim() ||
                        !historyForm.value.startOn ||
                        (!!historyForm.value.endOn && historyForm.value.endOn < historyForm.value.startOn) ||
                        (!!historyForm.value.salary.trim() && (!/^\d{1,14}(\.\d{1,4})?$/.test(historyForm.value.salary.trim()) || !historyForm.value.currency))
                      }
                      onClick={() => {
                        setHistory(upsert(history, historyForm.key, historyForm.value));
                        setHistoryForm({ value: emptyHistory() });
                      }}
                    >
                      <Plus className="size-4" />
                      {historyForm.key ? "Update previous employment" : "Add previous employment"}
                    </Button>
                  </FormEnd>
                </div>
              ) : null}
            </StepSection>
          ) : null}
        </div>
      )}
    </HrRecordDrawer>
  );
}
