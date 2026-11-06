import { describe, expect, it, vi } from "vitest";

import type { HrApiClient } from "../../app/features/hr/api/hr-client";
import {
  organisationLandingSummaries,
  peopleLandingSummaries,
  recruitmentLandingSummaries,
} from "../../app/features/hr/model/hr-landing-summaries";
import {
  countLabel,
  details,
  nameList,
  tally,
  type HrLandingSummaryContext,
} from "../../app/features/hr/model/hr-landing-summary";

function context(client: Partial<Record<keyof HrApiClient, unknown>>): HrLandingSummaryContext {
  const cache = new Map<string, Promise<unknown>>();
  return {
    client: client as unknown as HrApiClient,
    companyId: "company-a",
    once: <T>(key: string, load: () => Promise<T>) => {
      if (!cache.has(key)) cache.set(key, load());
      return cache.get(key) as Promise<T>;
    },
  };
}

const unit = (type: string, status = "active") => ({ type, status });
const master = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  status: "active",
  configuration_key: null,
  configuration_value: null,
  payment_route: null,
  ...extra,
});

describe("HR landing summary helpers", () => {
  it("formats counts, name lists, tallies and detail lists", () => {
    expect(countLabel(1, "branch", "branches")).toBe("1 branch");
    expect(countLabel(4, "branch", "branches")).toBe("4 branches");
    expect(nameList(["Dubai", "Lahore", " Dubai ", "", "Karachi", "Riyadh"])).toBe("Dubai · Lahore · Karachi +1 more");
    expect(tally(["draft", "approved", "draft"])).toBe("2 draft · 1 approved");
    expect(details("a", null, "", false, "b", "c")).toEqual(["a", "b"]);
  });
});

describe("Organisation & Masters landing summaries", () => {
  it("counts active companies, projects, locations and departments for Organisation Structure", async () => {
    // Branch units are shown as Projects and division units as Locations.
    const client = {
      companies: vi.fn(async () => ({ items: [{ id: "a" }, { id: "b" }] })),
      organizationUnits: vi.fn(async () => ({
        items: [
          unit("branch"),
          unit("branch"),
          unit("department"),
          unit("department", "inactive"),
          unit("division"),
          unit("business_unit"),
        ],
      })),
    };
    await expect(organisationLandingSummaries["org-structure"]!(context(client))).resolves.toEqual([
      "2 companies · 2 projects · 1 location · 1 department",
      "1 business unit",
    ]);
  });

  it("lists configured work locations and reports an empty master as no records", async () => {
    const masters = vi.fn(async ({ type }: { type: string }) => ({
      items: type === "work_location" ? [master("Dubai"), master("Lahore")] : [],
    }));
    const shared = context({ masters });
    await expect(organisationLandingSummaries["work-locations"]!(shared)).resolves.toEqual([
      "2 locations",
      "Dubai · Lahore",
    ]);
    await expect(organisationLandingSummaries.designations!(shared)).resolves.toEqual([]);
  });

  it("shows cost centres with how many carry a default nominal code", async () => {
    const masters = vi.fn(async () => ({
      items: [
        master("Head office", { configuration_key: "default_nominal", configuration_value: "6100" }),
        master("Projects"),
      ],
    }));
    await expect(organisationLandingSummaries["cost-centres"]!(context({ masters }))).resolves.toEqual([
      "2 cost centres",
      "Head office · Projects",
    ]);
  });

  it("summarises job grade levels, currencies and band coverage", async () => {
    const grade = (level: number, banded: boolean) => ({
      status: "active",
      grade_level: level,
      currency_code: "PKR",
      band_minimum: banded ? "1" : null,
      band_maximum: banded ? "2" : null,
    });
    const jobGrades = vi.fn(async () => ({ items: [grade(3, true), grade(1, true), grade(2, false)] }));
    await expect(organisationLandingSummaries["job-grades"]!(context({ jobGrades }))).resolves.toEqual([
      "Grades 1–3",
      "3 grades · PKR",
    ]);
  });
});

describe("People and Recruitment landing summaries", () => {
  it("shares one dashboard read between People cards", async () => {
    const dashboard = vi.fn(async () => ({
      metrics: {
        active_headcount: 12,
        draft_profiles: 0,
        pending_employee_approvals: 2,
        pending_movements: 1,
        active_departments: 3,
        recent_joiners: 4,
        master_configuration_gaps: 0,
      },
    }));
    const shared = context({ dashboard });
    await expect(peopleLandingSummaries.employees!(shared)).resolves.toEqual([
      "12 active employees",
      "3 departments · 4 recent joiners",
    ]);
    await expect(peopleLandingSummaries["hr-dashboard"]!(shared)).resolves.toEqual([
      "12 active employees",
      "Pending: 2 approvals · 1 movement",
    ]);
    expect(dashboard).toHaveBeenCalledTimes(1);
  });

  it("tallies requisition states and propagates read failures", async () => {
    const manpowerRequisitions = vi.fn(async () => ({
      items: [
        { state: "draft", hiring_basis: "permanent" },
        { state: "approved", hiring_basis: "project_based" },
        { state: "draft", hiring_basis: null },
      ],
    }));
    await expect(
      recruitmentLandingSummaries["manpower-requisitions"]!(context({ manpowerRequisitions })),
    ).resolves.toEqual(["3 requisitions", "2 draft · 1 approved"]);
    const failing = vi.fn(async () => {
      throw new Error("forbidden");
    });
    await expect(recruitmentLandingSummaries.candidates!(context({ candidates: failing }))).rejects.toThrow(
      "forbidden",
    );
  });
});
