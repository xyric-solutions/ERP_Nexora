"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { SearchableSelect, type SearchableSelectOption } from "@/shared/ui/searchable-select";

/** Lookup only: the surrounding Projects forms retain their prototype save actions. */
export function ProjectServiceField({
  label = "Project",
  required = false,
  className,
}: {
  label?: string;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  const { api, session } = useSession();
  const company = session?.active_company?.id ?? "";
  const scope = `${session?.tenant_id ?? ""}:${company}`;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ scope: string; value: string }>({ scope: "", value: "" });
  const [directory, setDirectory] = useState<{
    key: string;
    items: SearchableSelectOption[];
    cursor: string | null;
    loading: boolean;
    error: string;
  }>({ key: "", items: [], cursor: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const key = `${scope}:${query}:${attempt}`;

  async function read(cursor?: string) {
    const params = new URLSearchParams({ company_id: company, limit: "100", search: query.trim() });
    if (cursor) params.set("cursor", cursor);
    return api.listReferenceMasters("projects", `?${params}`);
  }

  function errorMessage(error: unknown) {
    return error instanceof ApiError && (error.status === 401 || error.status === 403)
      ? "You do not have access to projects in this company."
      : "Projects could not be loaded. Try again.";
  }

  useEffect(() => {
    const token = ++generation.current;
    if (!company) return;
    const timer = setTimeout(() => {
      setDirectory({ key, items: [], cursor: null, loading: true, error: "" });
      const params = new URLSearchParams({ company_id: company, limit: "100", search: query.trim() });
      void api.listReferenceMasters("projects", `?${params}`).then(
        (result) => {
          if (token !== generation.current) return;
          setDirectory({
            key,
            items: result.items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })),
            cursor: result.next_cursor,
            loading: false,
            error: "",
          });
        },
        (error: unknown) => {
          if (token === generation.current)
            setDirectory({ key, items: [], cursor: null, loading: false, error: errorMessage(error) });
        },
      );
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [api, company, key, query]);

  const current = directory.key === key ? directory : { items: [], cursor: null, loading: Boolean(company), error: "" };
  async function more() {
    if (!current.cursor || current.loading) return;
    const token = generation.current;
    setDirectory((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const result = await read(current.cursor);
      if (token !== generation.current) return;
      setDirectory((previous) => ({
        ...previous,
        items: [
          ...previous.items,
          ...result.items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })),
        ],
        cursor: result.next_cursor,
        loading: false,
      }));
    } catch (error) {
      if (token === generation.current)
        setDirectory((previous) => ({ ...previous, loading: false, error: errorMessage(error) }));
    }
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      <SearchableSelect
        key={scope}
        id={id}
        inlineSearch
        label={label}
        required={required}
        value={selected.scope === scope ? selected.value : ""}
        onValueChange={(value) => setSelected({ scope, value })}
        options={current.items}
        search={query}
        onSearchChange={setQuery}
        placeholder="Search projects by code or name…"
        loading={current.loading}
        disabled={!company}
        invalid={Boolean(current.error)}
        footer={
          current.cursor ? (
            <Button type="button" variant="ghost" size="sm" disabled={current.loading} onClick={() => void more()}>
              Load more projects
            </Button>
          ) : undefined
        }
      />
      {!company ? <p className="text-xs text-muted-foreground">Choose a company at sign-in to load projects.</p> : null}
      {current.error ? (
        <div role="alert" className="text-xs text-destructive">
          {current.error}{" "}
          <Button type="button" variant="link" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
