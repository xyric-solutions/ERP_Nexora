"use client";
import { WorkTable } from "@/shared/ui/work-table";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronRight,
  Layers3,
  LayoutGrid,
  List,
  Search,
  Users,
  MapPin,
  BriefcaseBusiness,
  Network,
  Wallet,
  GraduationCap,
  Tags,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { HrDetailGroup, HrDetailNote, HrDetailSection, HrDetailTile } from "../components/hr-detail-tile";

const sections = [
  {
    id: "organisation",
    label: "Organisation",
    description: "Define your structure and where your people work.",
    items: [
      {
        id: "structure",
        label: "Organisation Structure",
        description: "Companies, branches and departments in one hierarchy.",
        icon: Network,
        count: 12,
        prefix: "ORG",
        rows: ["Head Office", "Karachi Branch", "Engineering Department"],
      },
      {
        id: "locations",
        label: "Work Locations",
        description: "Offices, remote locations and working arrangements.",
        icon: MapPin,
        count: 4,
        prefix: "LOC",
        rows: ["Karachi Office", "Lahore Office", "Remote Workspace"],
      },
      {
        id: "cost-centres",
        label: "Cost Centres",
        description: "Connect people and expenses to the right business area.",
        icon: Wallet,
        count: 6,
        prefix: "CC",
        rows: ["Technology", "Sales & Marketing", "Corporate Services"],
      },
    ],
  },
  {
    id: "job-structure",
    label: "Job Structure",
    description: "Organise roles, titles and progression levels.",
    items: [
      {
        id: "designations",
        label: "Designations",
        description: "Standard titles used across employee assignments.",
        icon: BriefcaseBusiness,
        count: 18,
        prefix: "DSG",
        rows: ["Software Engineer", "Product Designer", "Team Lead"],
      },
      {
        id: "grades",
        label: "Job Grades",
        description: "Grade levels and optional compensation bands.",
        icon: GraduationCap,
        count: 7,
        prefix: "GRD",
        rows: ["Associate", "Professional", "Senior Professional"],
      },
      {
        id: "jobs",
        label: "Jobs",
        description: "Reusable job definitions for hiring and placement.",
        icon: Layers3,
        count: 24,
        prefix: "JOB",
        rows: ["Frontend Development", "Quality Assurance", "Customer Success"],
      },
    ],
  },
  {
    id: "employment",
    label: "Employment Setup",
    description: "Set the employment categories behind your policies.",
    items: [
      {
        id: "types",
        label: "Employment Types",
        description: "Permanent, contract, internship and other arrangements.",
        icon: Users,
        count: 5,
        prefix: "ET",
        rows: ["Permanent", "Fixed-term Contract", "Internship"],
      },
      {
        id: "categories",
        label: "Employee Categories",
        description: "Group employees for policies, benefits and pay cycles.",
        icon: Tags,
        count: 4,
        prefix: "EC",
        rows: ["Management", "Professional Staff", "Support Staff"],
      },
    ],
  },
];
const allItems = sections.flatMap((section) => section.items);
type Item = (typeof allItems)[number];

export function OrganisationMastersDemo() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Item | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [display, setDisplay] = useState<"cards" | "list">("cards");
  const query = search.trim().toLowerCase();
  const filtered = sections
    .filter((section) => category === "all" || section.id === category)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(query)),
    }))
    .filter((section) => section.items.length);

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside
        className={`${mobileMenu ? "block" : "hidden"} border-r border-border bg-[var(--nx-emphasis-background)] text-[var(--nx-emphasis-text)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col`}
      >
        <div className="flex items-center gap-3 border-b border-[var(--nx-emphasis-border)] px-5 py-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--nx-emphasis-surface)] text-lg font-bold">
            N
          </span>
          <div>
            <p className="font-bold">Nexora ERP</p>
            <p className="text-xs text-[var(--nx-emphasis-muted)]">Connected workspace</p>
          </div>
        </div>
        <nav aria-label="Demo main navigation" className="space-y-1 p-3">
          <p className="px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nx-emphasis-muted)]">
            HR & Payroll
          </p>
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setCategory("all");
              setSearch("");
              setMobileMenu(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg border-0 bg-[var(--nx-emphasis-surface-hover)] px-3 py-3 text-left text-sm font-semibold text-[var(--nx-emphasis-text)]!"
            aria-current="page"
          >
            <Building2 className="size-4 shrink-0" />
            <span>Organisation & Masters</span>
          </button>
          {[
            { icon: Users, label: "People" },
            { icon: BriefcaseBusiness, label: "Recruitment" },
            { icon: Wallet, label: "Payroll" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 px-3 py-3 text-sm text-[var(--nx-emphasis-muted)]">
              <Icon className="size-4" />
              {label}
              <ChevronRight className="ml-auto size-3" />
            </div>
          ))}
        </nav>
        <div className="m-4 mt-auto rounded-lg border border-[var(--nx-emphasis-border)] p-3 text-xs leading-relaxed text-[var(--nx-emphasis-muted)]">
          One menu item.
          <br />
          All eight master pages inside the workspace.
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              aria-label="Toggle demo menu"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu />
            </Button>
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              Navigation preview
            </span>
            <span className="text-sm text-muted-foreground">Sample data only</span>
          </div>
          <Link
            href="/#/hr/cost-centres"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back to ERP
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>HR & Payroll</span>
            <ChevronRight className="size-3" />
            <button type="button" onClick={() => setActive(null)} className="hover:text-primary">
              Organisation & Masters
            </button>
            {active ? (
              <>
                <ChevronRight className="size-3" />
                <span className="text-foreground">{active.label}</span>
              </>
            ) : null}
          </nav>
          {active ? (
            <>
              <Button
                variant="ghost"
                className="mb-4 -ml-2"
                onClick={() => {
                  setActive(null);
                  setSelected(null);
                }}
              >
                <ArrowLeft />
                All masters
              </Button>
              <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">Organisation & Masters</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">{active.label}</h1>
                  <p className="mt-2 text-muted-foreground">{active.description}</p>
                </div>
                <span className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                  Demo records
                </span>
              </div>
              <div className="mb-6 flex gap-2 overflow-x-auto border-b pb-3" aria-label="Switch master page">
                {allItems.map((item) => (
                  <Button
                    key={item.id}
                    variant={active.id === item.id ? "default" : "outline"}
                    onClick={() => {
                      setActive(item);
                      setSelected(null);
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <p className="font-semibold">Example records</p>
                  <p className="text-xs text-muted-foreground">Select a name to preview</p>
                </div>
                <div className="overflow-x-auto">
                  <WorkTable tableId="app/features/hr/views/organisation-masters-demo:1" className="w-full min-w-120 text-left text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">Code</th>
                        <th className="px-5 py-3 font-medium">Name</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3">
                          <span className="sr-only">Open</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.rows.map((name, index) => (
                        <tr key={name} className="border-t">
                          <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                            {active.prefix}-{String(index + 1).padStart(3, "0")}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              className="font-semibold text-primary hover:underline"
                              onClick={() => setSelected(name)}
                            >
                              {name}
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Active</span>
                          </td>
                          <td className="px-5 py-4">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`View ${name}`}
                              onClick={() => setSelected(name)}
                            >
                              <ArrowRight />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </WorkTable>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">Company setup</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Organisation & Masters</h1>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                    Your structure, roles and employment settings. Everything in one place, with a shorter left menu.
                  </p>
                </div>
                <div className="rounded-lg border bg-card px-4 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">Sample company</p>
                  <p className="mt-1 font-semibold">Nexora Services</p>
                </div>
              </div>
              <div className="mb-7 grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Find a master page"
                    className="h-10 pl-10"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find a master page…"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1" aria-label="Filter master groups">
                  {[{ id: "all", label: "All masters" }, ...sections].map((section) => (
                    <Button
                      key={section.id}
                      variant={category === section.id ? "default" : "ghost"}
                      onClick={() => setCategory(section.id)}
                      aria-pressed={category === section.id}
                    >
                      {section.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {filtered.reduce((count, section) => count + section.items.length, 0)} master pages
                </span>
                <div className="flex gap-1 rounded-lg border bg-card p-1">
                  <Button
                    variant={display === "cards" ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label="Card view"
                    aria-pressed={display === "cards"}
                    onClick={() => setDisplay("cards")}
                  >
                    <LayoutGrid />
                  </Button>
                  <Button
                    variant={display === "list" ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label="List view"
                    aria-pressed={display === "list"}
                    onClick={() => setDisplay("list")}
                  >
                    <List />
                  </Button>
                </div>
              </div>
              <div className="space-y-8">
                {filtered.map((section) => (
                  <section key={section.id} aria-label={section.label}>
                    <div className="mb-4 flex items-start gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-semibold text-primary">
                        {sections.findIndex((item) => item.id === section.id) + 1}
                      </span>
                      <div>
                        <h2 className="text-lg font-semibold">{section.label}</h2>
                        <p className="text-sm text-muted-foreground">{section.description}</p>
                      </div>
                    </div>
                    <div className={display === "cards" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "grid gap-2"}>
                      {section.items.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setActive(item);
                            setSelected(null);
                          }}
                          className={`group rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${display === "list" ? "flex items-center gap-4" : "flex flex-col"}`}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <item.icon className="size-5" />
                          </span>
                          <span className={display === "cards" ? "mt-4 flex-1" : "min-w-0 flex-1"}>
                            <span className="block font-semibold group-hover:text-primary">{item.label}</span>
                            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                              {item.description}
                            </span>
                          </span>
                          <span
                            className={`flex items-center justify-between gap-3 text-xs ${display === "cards" ? "mt-5 w-full border-t pt-3" : "shrink-0"}`}
                          >
                            <span className="text-muted-foreground">{item.count} records</span>
                            <ArrowRight className="size-4 text-primary" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center">
                  <p className="font-semibold">No master pages found</p>
                  <p className="mt-2 text-sm text-muted-foreground">Try another search or select All masters.</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setCategory("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : null}
            </>
          )}
          <p className="mt-10 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Concept preview · All counts and records are illustrative. This separate page demonstrates navigation;
            existing ERP menus and records are unchanged.
          </p>
        </main>
      </div>
      <HrMasterSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        eyebrow={active?.label ?? "Master preview"}
        title={selected ?? "Record"}
        description="Sample record · view preview"
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close preview
          </Button>
        }
      >
        <div className="grid min-w-0 gap-4">
          <HrDetailGroup title="Details">
            <HrDetailTile label="Name" value={selected} />
          </HrDetailGroup>
          <HrDetailSection title="Preview">
            <HrDetailNote>
              After approval, the existing add, edit and view sheets can be opened from these workspace pages. This demo
              uses illustrative content only.
            </HrDetailNote>
          </HrDetailSection>
        </div>
      </HrMasterSheet>
    </div>
  );
}
