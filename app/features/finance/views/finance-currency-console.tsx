"use client";

import { Button } from "@/components/ui/button";
import { FinanceCurrencies } from "./company-currencies-workspace";
import { MultiCurrencyWorkspace } from "./multi-currency-workspace";

export function FinanceCurrencyConsole({
  section,
  onSectionChange,
}: {
  section?: string;
  onSectionChange: (section?: string) => void;
}) {
  const accounting = section === "accounting" || section === "revaluation";
  return (
    <section className="grid min-w-0 gap-5" aria-label="Currencies and Transfer FX">
      <header className="border-b border-border pb-4">
        <p className="m-0 text-sm text-primary">Home / Accounting / Currencies &amp; Transfer FX</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Currencies &amp; Transfer FX</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage company currencies, exchange rates, transfer rules and customer or supplier currency balances.
        </p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Currency workspace views">
        <Button
          type="button"
          variant={accounting ? "outline" : "default"}
          aria-pressed={!accounting}
          onClick={() => onSectionChange()}
        >
          Currencies &amp; transfer rules
        </Button>
        <Button
          type="button"
          variant={accounting ? "default" : "outline"}
          aria-pressed={accounting}
          onClick={() => onSectionChange("accounting")}
        >
          Balances &amp; transactions
        </Button>
      </nav>
      {accounting ? (
        <div
          id="currency-accounting-view"
          className="min-w-0"
          role="region"
          aria-label="Currency balances and transactions"
        >
          <MultiCurrencyWorkspace embedded initialTab={section === "revaluation" ? "revaluation" : "balances"} />
        </div>
      ) : (
        <div id="currency-setup-view" className="min-w-0" role="region" aria-label="Currencies and transfer rules">
          <FinanceCurrencies embedded />
        </div>
      )}
    </section>
  );
}
