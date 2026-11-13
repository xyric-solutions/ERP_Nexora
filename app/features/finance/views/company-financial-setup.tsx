"use client";

import { Button } from "@/components/ui/button";
import { FinanceCurrencies } from "./company-currencies-workspace";
import { FinanceFiscalPeriods } from "./finance-fiscal-periods";

export function CompanyFinancialSetup({
  section,
  onSectionChange,
}: {
  section?: string;
  onSectionChange: (section: "fiscal" | "currencies") => void;
}) {
  const currencies = section === "currencies";
  return (
    <section className="grid min-w-0 gap-5" aria-label="Company financial setup">
      <header className="border-b border-border pb-4">
        <p className="m-0 text-sm text-primary">Configuration / Company Setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Company Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the fiscal year and reporting currency for your company before entering financial transactions.
        </p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Company setup sections">
        <Button
          type="button"
          variant={currencies ? "outline" : "default"}
          aria-pressed={!currencies}
          onClick={() => onSectionChange("fiscal")}
        >
          Fiscal year &amp; periods
        </Button>
        <Button
          type="button"
          variant={currencies ? "default" : "outline"}
          aria-pressed={currencies}
          onClick={() => onSectionChange("currencies")}
        >
          Company currencies
        </Button>
      </nav>
      <div className="min-w-0">{currencies ? <FinanceCurrencies embedded /> : <FinanceFiscalPeriods />}</div>
    </section>
  );
}
