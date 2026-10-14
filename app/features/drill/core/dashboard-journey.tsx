"use client";

import { DrillRenderer } from "./drill-renderer.tsx";
import { getChain, getFactView } from "./registry.ts";
import { Button } from "@/components/ui/button";

export interface DashboardDrillRequest {
  subject: string;
  targetModuleId?: string;
}

interface DashboardDrillJourneyProps {
  roleId: string;
  dashboardTitle: string;
  request: DashboardDrillRequest;
  onClose: () => void;
}

interface DrillSpec {
  viewId: string;
  chainId: string;
  domain: string;
}

const salesModules = new Set(["sales", "customers", "crm", "revenue"]);
const procurementModules = new Set(["purchases", "suppliers"]);
const inventoryModules = new Set(["inventory", "manufacturing", "quality", "operations"]);

const salesRoles = new Set(["sales-manager", "sales-executive", "crm-manager"]);
const procurementRoles = new Set(["purchase-manager", "procurement-officer", "ap-manager"]);
const inventoryRoles = new Set(["inventory-manager", "warehouse-user", "production-manager"]);

export function resolveDashboardDrill(roleId: string, targetModuleId?: string): DrillSpec {
  if ((targetModuleId && salesModules.has(targetModuleId)) || salesRoles.has(roleId)) {
    return { viewId: "sales-revenue", chainId: "territory", domain: "Revenue" };
  }
  if ((targetModuleId && procurementModules.has(targetModuleId)) || procurementRoles.has(roleId)) {
    return { viewId: "procurement-spend", chainId: "category", domain: "Procurement" };
  }
  if ((targetModuleId && inventoryModules.has(targetModuleId)) || inventoryRoles.has(roleId)) {
    return { viewId: "inventory-movement", chainId: "warehouse", domain: "Inventory" };
  }
  return { viewId: "finance-gl", chainId: "statement", domain: "Finance" };
}

export function DashboardDrillJourney({ roleId, dashboardTitle, request, onClose }: DashboardDrillJourneyProps) {
  const spec = resolveDashboardDrill(roleId, request.targetModuleId);
  const view = getFactView(spec.viewId);
  const chain = getChain(spec.viewId, spec.chainId);

  if (!view || !chain) {
    return (
      <section className="nx-dashboard-drill-shell">
        <Button variant="ghost" className="nx-dashboard-drill-shell__back" type="button" onClick={onClose}>← Back to dashboard</Button>
        <div className="nx-drill__source-note">This prototype drill view is temporarily unavailable.</div>
      </section>
    );
  }

  return (
    <section className="nx-dashboard-drill-shell" aria-label={request.subject + " dashboard drill journey"}>
      <header className="nx-dashboard-drill-shell__head">
        <div>
          <Button variant="ghost" className="nx-dashboard-drill-shell__back" type="button" onClick={onClose}>← Back to {dashboardTitle}</Button>
          <span className="nx-eyebrow">Universal dashboard drill</span>
          <h1>{request.subject}</h1>
          <p>{spec.domain} analysis connected to a complete source-transaction journey. Select any visual child to continue.</p>
        </div>
        <div className="nx-dashboard-drill-shell__path"><span>Minimum journey</span><strong>Dashboard → analysis → detail → document → transaction</strong><small>Every layer uses the same governed fact view.</small></div>
      </header>
      <DrillRenderer
        chain={chain}
        rows={view.rows}
        currency={view.currency}
        minorUnits={view.minorUnits}
        moduleId="dashboard"
        pageId={roleId + "-universal-drill"}
        title={request.subject}
        headlineNote={"Opened from " + dashboardTitle + ". Values are deterministic prototype facts, not Demo Account data."}
        syncUrl={false}
      />
    </section>
  );
}
