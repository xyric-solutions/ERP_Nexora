// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceMasterWorkspace } from "../../app/features/master-data/views/reference-master-workspace.js";
import { ApiError } from "../../app/lib/api/generated.js";
const harness = vi.hoisted(() => ({
  permissions: ["master_data.project.read", "master_data.project.manage"],
  tenant: "one",
  notify: vi.fn(),
  api: {
    listReferenceMasterCompanies: vi.fn(),
    listReferenceMasters: vi.fn(),
    getReferenceMaster: vi.fn(),
    createReferenceMaster: vi.fn(),
    updateReferenceMaster: vi.fn(),
    changeReferenceMasterStatus: vi.fn(),
  },
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    loading: false,
    session: { tenant_id: harness.tenant, user: { id: "maker", permissions: harness.permissions } },
    csrfToken: () => "synthetic",
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));
const record = {
  id: "project-one",
  company_id: "company-one",
  code: "PRJ-1",
  name: "Synthetic project",
  status: "active",
  version: 1,
  created_by: "maker",
  updated_by: "maker",
  created_at: "2026-10-21T00:00:00.000Z",
  updated_at: "2026-10-21T00:00:00.000Z",
};
let container: HTMLDivElement, root: Root;
async function settle(ms = 250) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Missing ${text}`);
  act(() => button.click());
}
function input(id: string, value: string) {
  const node = container.querySelector(`#${id}`);
  if (!(node instanceof HTMLInputElement)) throw new Error(`Missing input ${id}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount() {
  act(() => root.render(<ReferenceMasterWorkspace kind="projects" />));
  await settle(0);
  await settle();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  harness.tenant = "one";
  harness.permissions.splice(0, harness.permissions.length, "master_data.project.read", "master_data.project.manage");
  harness.api.listReferenceMasterCompanies.mockResolvedValue({
    items: [{ id: "company-one", code: "ONE", name: "Company One" }],
  });
  harness.api.listReferenceMasters.mockResolvedValue({ items: [record], next_cursor: null });
  harness.api.getReferenceMaster.mockResolvedValue(record);
  harness.api.createReferenceMaster.mockResolvedValue({ record, audit_event_id: "synthetic" });
  harness.api.updateReferenceMaster.mockResolvedValue({
    record: { ...record, version: 2 },
    audit_event_id: "synthetic",
  });
  harness.api.changeReferenceMasterStatus.mockResolvedValue({
    record: { ...record, version: 2, status: "inactive" },
    audit_event_id: "synthetic",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Reference management workspace", () => {
  it("loads real companies/directory and creates through the generated API", async () => {
    await mount();
    expect(container.textContent).toContain("Synthetic project");
    click("Add Project");
    input("reference-code", "PRJ-NEW");
    input("reference-name", "New project");
    click("Save reference");
    await settle(0);
    expect(harness.api.createReferenceMaster).toHaveBeenCalledWith(
      "projects",
      { company_id: "company-one", code: "PRJ-NEW", name: "New project" },
      "synthetic",
      expect.any(String),
    );
    expect(harness.notify).toHaveBeenCalledWith("Project created successfully.");
  });
  it("views persisted details, preserves code and edits with the expected version", async () => {
    await mount();
    click("View PRJ-1");
    await settle(0);
    expect(harness.api.getReferenceMaster).toHaveBeenCalledWith("projects", "project-one", "company-one");
    expect((container.querySelector("#reference-code") as HTMLInputElement).readOnly).toBe(true);
    click("Edit reference");
    input("reference-name", "Edited project");
    click("Save reference");
    await settle(0);
    expect(harness.api.updateReferenceMaster).toHaveBeenCalledWith(
      "projects",
      "project-one",
      { company_id: "company-one", expected_version: 1, name: "Edited project" },
      "synthetic",
      expect.any(String),
    );
  });
  it("requires explicit confirmation before changing active status", async () => {
    await mount();
    click("View PRJ-1");
    await settle(0);
    click("Deactivate");
    expect(harness.api.changeReferenceMasterStatus).not.toHaveBeenCalled();
    click("Confirm status change");
    await settle(0);
    expect(harness.api.changeReferenceMasterStatus).toHaveBeenCalledWith(
      "projects",
      "project-one",
      expect.objectContaining({ expected_version: 1, status: "inactive" }),
      "synthetic",
      expect.any(String),
    );
  });
  it("reuses the request key after failure and does not report false success", async () => {
    await mount();
    click("Add Project");
    input("reference-code", "DUP");
    input("reference-name", "Synthetic duplicate");
    harness.api.createReferenceMaster.mockRejectedValueOnce(
      new ApiError(409, "Code already exists", "MASTER_CODE_CONFLICT"),
    );
    click("Save reference");
    await settle(0);
    expect(container.textContent).toContain("Code already exists");
    expect(harness.notify).not.toHaveBeenCalled();
    const first = harness.api.createReferenceMaster.mock.calls[0]![3];
    click("Save reference");
    await settle(0);
    expect(harness.api.createReferenceMaster.mock.calls[1]![3]).toBe(first);
  });
  it("permits read-only viewing without management controls", async () => {
    harness.permissions.splice(1);
    await mount();
    expect([...container.querySelectorAll("button")].find((item) => item.textContent === "Add Project")?.disabled).toBe(
      true,
    );
    click("View PRJ-1");
    await settle(0);
    expect(container.textContent).toContain("Reference details");
    expect(container.textContent).not.toContain("Edit reference");
  });
  it("denies access without read permission without requesting company data", async () => {
    harness.permissions.splice(0);
    await mount();
    expect(container.textContent).toContain("do not have permission");
    expect(harness.api.listReferenceMasterCompanies).not.toHaveBeenCalled();
  });
  it("uses the same implementation for locations and resets tenant state", async () => {
    harness.permissions.splice(
      0,
      harness.permissions.length,
      "master_data.location.read",
      "master_data.location.manage",
    );
    act(() => root.render(<ReferenceMasterWorkspace kind="locations" />));
    await settle(0);
    await settle();
    expect(harness.api.listReferenceMasters).toHaveBeenCalledWith("locations", expect.any(String));
    harness.tenant = "two";
    harness.api.listReferenceMasters.mockResolvedValue({ items: [], next_cursor: null });
    act(() => root.render(<ReferenceMasterWorkspace kind="locations" />));
    expect(container.textContent).not.toContain("Synthetic project");
    await settle(0);
    await settle();
    expect(container.textContent).toContain("No records match");
  });
});
