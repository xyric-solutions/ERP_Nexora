"use client";
import { useEffect, useRef, useState } from "react";
import type { ProductCategory, ProductCategoryDirectory } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkTable } from "@/shared/ui/work-table";
import { productError, productSelectClass } from "../model/products";
import { ProductWorkspaceTabs } from "../components/product-workspace-tabs";
export function ProductCategoriesWorkspace({
  onNavigate,
  onDirtyChange,
}: {
  onNavigate: (module: string, page: string, ref?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { activeCompany } = useSession();
  if (!activeCompany) return <p role="status">Choose your company to configure product categories.</p>;
  return (
    <CompanyCategories
      key={activeCompany.id}
      company={activeCompany.id}
      onNavigate={onNavigate}
      onDirtyChange={onDirtyChange}
    />
  );
}
function CompanyCategories({
  company,
  onNavigate,
  onDirtyChange,
}: {
  company: string;
  onNavigate: (module: string, page: string, ref?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    [directory, setDirectory] = useState<ProductCategoryDirectory>({ items: [], next_cursor: null }),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<ProductCategory | null | undefined>(),
    [name, setName] = useState(""),
    [status, setStatus] = useState<"active" | "inactive">("active"),
    [reason, setReason] = useState(""),
    [dirty, setDirty] = useState(false),
    retry = useRef<{ body: string; key: string } | null>(null),
    lock = useRef(false);
  const canManage = session?.user.permissions.includes("inventory.category.manage") && !session?.impersonation;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      api
        .listProductCategories(`?${new URLSearchParams({ company_id: company, search, limit: "30" })}`)
        .then((result) => {
          if (active) setDirectory(result);
        })
        .catch((e) => {
          if (active) setError(productError(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      active = false;
    };
  }, [api, company, search, refresh]);
  function edit(record: ProductCategory | null) {
    if (busy) return;
    if (dirty && !confirm("Discard unsaved category changes?")) return;
    setEditing(record);
    setName(record?.name ?? "");
    setStatus(record?.status ?? "active");
    setReason("");
    setDirty(false);
    setError("");
  }
  async function more() {
    if (loading || !directory.next_cursor) return;
    setLoading(true);
    try {
      const result = await api.listProductCategories(
        `?${new URLSearchParams({ company_id: company, search, after: directory.next_cursor, limit: "30" })}`,
      );
      setDirectory((current) => ({ items: [...current.items, ...result.items], next_cursor: result.next_cursor }));
    } catch (e) {
      setError(productError(e));
    } finally {
      setLoading(false);
    }
  }
  async function save() {
    if (lock.current || !canManage || !name.trim() || !reason.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const payload = {
        company_id: company,
        name: name.trim(),
        status,
        reason: reason.trim(),
        ...(editing ? { expected_version: editing.version } : {}),
      },
      body = JSON.stringify({ id: editing?.id, payload });
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try {
      await api.saveProductCategory(editing?.id ?? null, payload, csrfToken(), retry.current.key);
      setEditing(undefined);
      setDirty(false);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(productError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-4">
      <ProductWorkspaceTabs configuration onNavigate={onNavigate} />
      <Card>
        <CardHeader>
          <CardTitle>Product categories</CardTitle>
          <CardDescription>Create Finished Goods, Raw Material and other categories for your company.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <LabeledField label="Search categories">
              <Input
                value={search}
                disabled={busy || loading}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={120}
              />
            </LabeledField>
            <Button variant="outline" disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
              Refresh
            </Button>
            {canManage ? (
              <Button disabled={busy} onClick={() => edit(null)}>
                Add category
              </Button>
            ) : null}
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {editing !== undefined ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <p className="m-0 text-sm">Code: {editing?.code ?? "Assigned on save"}</p>
              <LabeledField label="Category name">
                <Input
                  required
                  maxLength={120}
                  value={name}
                  disabled={busy}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                />
              </LabeledField>
              <LabeledField label="Category status">
                <select
                  className={productSelectClass}
                  value={status}
                  disabled={busy}
                  onChange={(e) => {
                    setStatus(e.target.value === "inactive" ? "inactive" : "active");
                    setDirty(true);
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </LabeledField>
              <LabeledField label="Reason">
                <Textarea
                  required
                  maxLength={1000}
                  value={reason}
                  disabled={busy}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setDirty(true);
                  }}
                />
              </LabeledField>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || !name.trim() || !reason.trim()}>
                  Save category
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (!dirty || confirm("Discard unsaved category changes?")) {
                      setEditing(undefined);
                      setDirty(false);
                    }
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
          <WorkTable tableId="product-categories" tools={false} keyboardScroll className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {directory.items.map((record) => (
                <tr key={record.id}>
                  <td>{record.code}</td>
                  <td>{record.name}</td>
                  <td>{record.status}</td>
                  <td>
                    {canManage ? (
                      <Button variant="link" disabled={busy} onClick={() => edit(record)}>
                        Edit {record.code}
                      </Button>
                    ) : (
                      "Read only"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
          {!directory.items.length ? (
            <p role="status">
              {loading ? "Loading categories…" : "No categories found. Create a category before adding a product."}
            </p>
          ) : null}
          {directory.next_cursor ? (
            <Button variant="outline" disabled={loading} onClick={() => void more()}>
              Load more categories
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
