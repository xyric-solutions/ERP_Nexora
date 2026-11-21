"use client";
import {
  decimal,
  decimalText,
  divideRounded,
  scaleQuantity,
  type BomInput,
  type BomChargeInput,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkTable } from "@/shared/ui/work-table";
import { ManufacturingLookup } from "./manufacturing-lookup";
import { ManufacturingUnitSelect } from "./manufacturing-unit-select";
import { MaterialBalanceCell } from "./material-balance";
const table =
  "w-full border-collapse text-left text-sm [&_th]:whitespace-nowrap [&_th]:bg-muted [&_th]:p-2 [&_td]:border-b [&_td]:border-border [&_td]:p-2 [&_td]:align-top";
type Known = Record<string, { label: string; unit: string }>;
export function BomTemplateSections({
  company,
  input,
  change,
  known,
  onKnown,
  disabled,
  existing,
}: {
  company: string;
  input: BomInput;
  change: (updater: (current: BomInput) => BomInput) => void;
  known: Known;
  onKnown: (id: string, label: string, unit?: string | null) => void;
  disabled: boolean;
  existing: boolean;
}) {
  const label = (id?: string | null) => (id ? (known[id]?.label ?? id) : "");
  function setLine(index: number, patch: Partial<BomInput["lines"][number]>) {
    change((c) => ({ ...c, lines: c.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  }
  function setCharge(index: number, patch: Partial<BomChargeInput>) {
    change((c) => ({
      ...c,
      charges: (c.charges ?? []).map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }
  function estimated(line: BomChargeInput) {
    try {
      return (
        decimalText(divideRounded(decimal(line.quantity, 4) * decimal(line.rate, 8), 10000n), 8).replace(
          /\.?0+$/,
          "",
        ) || "0"
      );
    } catch {
      return "—";
    }
  }
  function perUnit(value: string) {
    try {
      return scaleQuantity(value, input.output_quantity, "1");
    } catch {
      return "—";
    }
  }
  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="Template name">
            <Input
              maxLength={120}
              value={input.template_name ?? ""}
              onChange={(e) => change((c) => ({ ...c, template_name: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="Default material warehouse">
            <ManufacturingLookup
              company={company}
              surface="boms"
              kind="warehouse"
              label="Default material warehouse"
              value={input.warehouse_id ?? ""}
              selectedLabel={label(input.warehouse_id)}
              onChange={(choice) => {
                if (choice) onKnown(choice.id, choice.label);
                change((c) => ({ ...c, warehouse_id: choice?.id ?? null }));
              }}
            />
          </LabeledField>
          <LabeledField label="Estimate currency">
            <ManufacturingLookup
              company={company}
              surface="boms"
              kind="currency"
              label="Estimate currency"
              value={input.currency ?? ""}
              selectedLabel={input.currency ?? "Company functional currency"}
              onChange={(choice) => change((c) => ({ ...c, currency: choice?.id }))}
            />
          </LabeledField>
          <p className="m-0 self-center text-sm text-muted-foreground">
            Estimated charges use the selected company currency. Actual costs require posted source evidence.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Finished Goods</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkTable tableId="bom-finished-goods" tools={false} keyboardScroll className={table}>
            <thead>
              <tr>
                <th>Product / Services</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Cost share</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <ManufacturingLookup
                    company={company}
                    surface="boms"
                    kind="finished_product"
                    label="Finished product"
                    value={input.product_id}
                    selectedLabel={label(input.product_id)}
                    required
                    disabled={existing || disabled}
                    onChange={(choice) => {
                      if (choice) onKnown(choice.id, choice.label, choice.unit);
                      change((c) => ({ ...c, product_id: choice?.id ?? "", output_unit_id: undefined }));
                    }}
                  />
                </td>
                <td>
                  <Input
                    aria-label="BOM output quantity"
                    inputMode="decimal"
                    value={input.output_quantity}
                    onChange={(e) => change((c) => ({ ...c, output_quantity: e.target.value }))}
                  />
                </td>
                <td>
                  <ManufacturingUnitSelect
                    company={company}
                    product={input.product_id}
                    quantity={input.output_quantity}
                    value={input.output_unit_id}
                    label="Finished goods unit"
                    onChange={(id) => change((c) => ({ ...c, output_unit_id: id }))}
                  />
                </td>
                <td>100% · Auto</td>
              </tr>
            </tbody>
          </WorkTable>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Raw Material</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <WorkTable tableId="bom-raw-materials" tools={false} keyboardScroll className={table}>
            <thead>
              <tr>
                <th>Product / Services</th>
                <th>Description</th>
                <th>Category / stock in hand</th>
                <th>Warehouse</th>
                <th>Unit</th>
                <th>BOM quantity</th>
                <th>Per output unit</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {input.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <ManufacturingLookup
                      company={company}
                      surface="boms"
                      kind="component"
                      label={`Material ${index + 1}`}
                      required
                      value={line.product_id}
                      selectedLabel={label(line.product_id)}
                      exclude={[
                        input.product_id,
                        ...input.lines.filter((_, i) => i !== index).map((l) => l.product_id),
                      ]}
                      onChange={(choice) => {
                        if (choice) onKnown(choice.id, choice.label, choice.unit);
                        setLine(index, { product_id: choice?.id ?? "", unit_id: undefined });
                      }}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Material description ${index + 1}`}
                      maxLength={500}
                      value={line.description ?? ""}
                      onChange={(e) => setLine(index, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <MaterialBalanceCell
                      company={company}
                      product={line.product_id}
                      warehouse={line.warehouse_id ?? input.warehouse_id}
                    />
                  </td>
                  <td>
                    <ManufacturingLookup
                      company={company}
                      surface="boms"
                      kind="warehouse"
                      label={`Material warehouse ${index + 1}`}
                      value={line.warehouse_id ?? ""}
                      selectedLabel={label(line.warehouse_id)}
                      onChange={(choice) => {
                        if (choice) onKnown(choice.id, choice.label);
                        setLine(index, { warehouse_id: choice?.id ?? null });
                      }}
                    />
                  </td>
                  <td>
                    <ManufacturingUnitSelect
                      company={company}
                      product={line.product_id}
                      quantity={line.quantity}
                      value={line.unit_id}
                      label={`Material unit ${index + 1}`}
                      onChange={(id) => setLine(index, { unit_id: id })}
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Component quantity ${index + 1}`}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => setLine(index, { quantity: e.target.value })}
                    />
                  </td>
                  <td>{perUnit(line.quantity)}</td>
                  <td>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={input.lines.length === 1}
                      onClick={() => change((c) => ({ ...c, lines: c.lines.filter((_, i) => i !== index) }))}
                    >
                      Remove material {index + 1}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
          <Button
            type="button"
            variant="outline"
            disabled={input.lines.length >= 200}
            onClick={() => change((c) => ({ ...c, lines: [...c.lines, { product_id: "", quantity: "1" }] }))}
          >
            Add material
          </Button>
        </CardContent>
      </Card>
      {(["non_stock", "expense"] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle>{kind === "non_stock" ? "Non Stock" : "Expenses"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <WorkTable tableId={`bom-${kind}`} tools={false} keyboardScroll className={table}>
              <thead>
                <tr>
                  <th>{kind === "non_stock" ? "Product" : "Expense"}</th>
                  <th>Details</th>
                  <th>Qty per BOM output</th>
                  <th>Estimated rate</th>
                  <th>Estimated amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(input.charges ?? []).map((line, index) =>
                  line.kind === kind ? (
                    <tr key={index}>
                      <td>
                        <ManufacturingLookup
                          company={company}
                          surface="boms"
                          kind={kind === "non_stock" ? "non_stock" : "expense"}
                          label={`${kind === "non_stock" ? "Non-stock product" : "Expense account"} ${index + 1}`}
                          value={(kind === "non_stock" ? line.product_id : line.expense_account_id) ?? ""}
                          selectedLabel={label(kind === "non_stock" ? line.product_id : line.expense_account_id)}
                          onChange={(choice) => {
                            if (choice) onKnown(choice.id, choice.label);
                            setCharge(
                              index,
                              kind === "non_stock"
                                ? { product_id: choice?.id ?? null }
                                : { expense_account_id: choice?.id ?? null },
                            );
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label={`Charge details ${index + 1}`}
                          maxLength={500}
                          value={line.description}
                          onChange={(e) => setCharge(index, { description: e.target.value })}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label={`Charge quantity ${index + 1}`}
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) => setCharge(index, { quantity: e.target.value })}
                        />
                      </td>
                      <td>
                        <Input
                          aria-label={`Charge rate ${index + 1}`}
                          inputMode="decimal"
                          value={line.rate}
                          onChange={(e) => setCharge(index, { rate: e.target.value })}
                        />
                      </td>
                      <td>
                        {input.currency ?? "Company currency"} {estimated(line)}
                      </td>
                      <td>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => change((c) => ({ ...c, charges: c.charges?.filter((_, i) => i !== index) }))}
                        >
                          Remove charge {index + 1}
                        </Button>
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </WorkTable>
            <Button
              type="button"
              variant="outline"
              disabled={(input.charges?.length ?? 0) >= 100}
              onClick={() =>
                change((c) => ({
                  ...c,
                  charges: [...(c.charges ?? []), { kind, description: "", quantity: "1", rate: "0" }],
                }))
              }
            >
              Add {kind === "non_stock" ? "non-stock item" : "expense"}
            </Button>
          </CardContent>
        </Card>
      ))}
      <LabeledField label="Notes">
        <Textarea
          maxLength={4000}
          value={input.notes}
          onChange={(e) => change((c) => ({ ...c, notes: e.target.value }))}
        />
      </LabeledField>
    </fieldset>
  );
}
