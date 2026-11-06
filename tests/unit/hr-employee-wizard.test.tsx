// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listHrCompanies: vi.fn(),
  listHrJobGradeCurrencies: vi.fn(),
  getHrEmployeeNumberPreview: vi.fn(),
  createHrEmployeeDraft: vi.fn(),
  createHrEmployeeContact: vi.fn(),
  createHrEmployeeEmergencyContact: vi.fn(),
  uploadHrEmployeeDocument: vi.fn(),
  createHrEmployeeEmploymentHistory: vi.fn(),
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api,
    csrfToken: () => "csrf-token",
    session: {
      user: {
        id: "user-1",
        permissions: [
          "hr.employee.create",
          "hr.employee.update",
          "hr.employee_contact.manage",
          "hr.employee_emergency_contact.manage",
          "hr.employee_document.manage",
        ],
      },
    },
  }),
}));

import { HrEmployeeWizard } from "../../app/features/hr/views/hr-employee-wizard.js";
import { HrDrawerActions } from "../../app/features/hr/components/hr-drawer-context.js";
import { HrMasterSheet } from "../../app/features/hr/components/hr-master-sheet.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const buttons = () => [...document.body.querySelectorAll("button")];
const button = (label: string) => {
  const found = buttons().find((candidate) => candidate.textContent?.trim() === label || candidate.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
};
const click = async (label: string) => {
  await act(async () => button(label).click());
  await flush();
};
/** The control inside the (nth) label whose own text is `text`. */
const control = (text: string, nth = 0) => {
  const label = [...document.body.querySelectorAll("label")].filter((candidate) => candidate.firstChild?.textContent?.trim() === text)[nth];
  const element = label?.querySelector("input:not([type=file]), select, textarea");
  if (!element) throw new Error(`Field not found: ${text}`);
  return element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
};
const type = async (text: string, value: string, nth = 0) => {
  const element = control(text, nth);
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

describe("HrEmployeeWizard", () => {
  beforeEach(() => {
    api.listHrCompanies.mockResolvedValue({ items: [{ id: "company-1", code: "C1", name: "Company One" }] });
    api.listHrJobGradeCurrencies.mockResolvedValue({ items: [{ currency_code: "PKR", currency_name: "Rupee", is_base: true }] });
    api.getHrEmployeeNumberPreview.mockResolvedValue({ employee_number: "EMP-007" });
    api.createHrEmployeeDraft.mockResolvedValue({ id: "employee-1", employee_number: "EMP-007", status: "draft", company_id: "company-1", audit_event_id: "a", replayed: false });
    for (const method of [api.createHrEmployeeContact, api.createHrEmployeeEmergencyContact, api.uploadHrEmployeeDocument, api.createHrEmployeeEmploymentHistory])
      method.mockImplementation(async () => ({ id: `saved-${Math.random()}`, employee_id: "employee-1", audit_event_id: "a", replayed: false }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("keeps every step's entries and saves them all on Create", async () => {
    const saved = vi.fn();
    await act(async () => root.render(<HrEmployeeWizard target={{ kind: "create" }} onClose={vi.fn()} onSaved={saved} />));
    await flush();

    expect((control("Employee number") as HTMLInputElement).value).toBe("EMP-007");
    expect((control("Employee number") as HTMLInputElement).readOnly).toBe(true);
    expect(document.body.textContent).not.toContain("company-scoped draft only");

    // Steps are optional: Next always moves on, even before any field is filled.
    await click("Next");
    expect(button("Add contact")).toBeTruthy();
    await click("Previous");
    await type("First name", "Ayesha");
    await type("Last name", "Khan");
    await type("Email", "ayesha@example.com");
    await click("Next");

    // Contact information holds both contacts and emergency contacts.
    await type("Phone number", "+92 300 1234567");
    await type("Label", "Mobile");
    await click("Add contact");
    await type("Contact name", "Sara Khan");
    await type("Relationship", "Sister");
    await type("Phone number", "+92 321 7654321", 1);
    await click("Add emergency contact");
    await click("Next");

    const file = new File(["%PDF-1.4"], "cnic.pdf", { type: "application/pdf" });
    const picker = [...document.body.querySelectorAll<HTMLInputElement>("input[type=file]")].find((input) => !input.hidden);
    await act(async () => {
      Object.defineProperty(picker!, "files", { value: [file], configurable: true });
      picker!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await type("Document type", "National ID");
    await click("Add document");
    await click("Next");

    await type("Previous company", "Acme Ltd");
    await type("Job position", "Software Engineer");
    await type("Start date", "2021-01-01");
    await type("Skills", "TypeScript, SQL");
    await type("Previous salary", "250000");
    await type("Salary currency", "PKR");
    await click("Add entry");

    // Going back keeps the entered data.
    await click("Previous");
    await click("Previous");
    expect(document.body.textContent).toContain("+92 300 1234567");
    expect(document.body.textContent).toContain("Sara Khan");
    await click("Previous");
    expect((control("First name") as HTMLInputElement).value).toBe("Ayesha");
    for (let index = 0; index < 3; index += 1) await click("Next");

    await click("Create");
    await flush();
    expect(api.createHrEmployeeDraft).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1", employee_number: "AUTO", first_name: "Ayesha", last_name: "Khan", work_email: "ayesha@example.com" }),
      "csrf-token",
      expect.any(String),
    );
    expect(api.createHrEmployeeContact).toHaveBeenCalledWith("employee-1", expect.objectContaining({ channel: "phone", contact_value: "+92 300 1234567", label: "Mobile" }), "csrf-token", expect.any(String));
    expect(api.createHrEmployeeEmergencyContact).toHaveBeenCalledWith("employee-1", expect.objectContaining({ name: "Sara Khan", relationship: "Sister", priority: 1 }), "csrf-token", expect.any(String));
    expect(api.uploadHrEmployeeDocument).toHaveBeenCalledWith("employee-1", expect.objectContaining({ document_type: "National ID", title: "cnic" }), file, "csrf-token", expect.any(String), undefined);
    expect(api.createHrEmployeeEmploymentHistory).toHaveBeenCalledWith(
      "employee-1",
      expect.objectContaining({ company_name: "Acme Ltd", job_title: "Software Engineer", skills: ["TypeScript", "SQL"], last_salary: "250000", salary_currency: "PKR" }),
      "csrf-token",
      expect.any(String),
    );
    expect(saved).toHaveBeenCalledWith(expect.stringContaining("EMP-007"), "EMP-007", "employee-1");
  });

  it("keeps the draft and the failed rows when one item cannot be saved", async () => {
    api.createHrEmployeeContact.mockRejectedValueOnce(new Error("refused"));
    const saved = vi.fn();
    await act(async () => root.render(<HrEmployeeWizard target={{ kind: "create" }} onClose={vi.fn()} onSaved={saved} />));
    await flush();
    await type("First name", "Bilal");
    await type("Last name", "Raza");
    await click("Next");
    await type("Phone number", "+92 300 0000000");
    await click("Add contact");
    for (let index = 0; index < 2; index += 1) await click("Next");
    await click("Create");
    await flush();
    expect(api.createHrEmployeeDraft).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("need attention: contact");
    // The drawer now edits the saved draft, so retrying never creates a second employee.
    expect(button("Save changes (1)")).toBeTruthy();
  });
});

describe("HrDrawerActions", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders drawer actions in the bottom action area and still submits their form", async () => {
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    await act(async () =>
      root.render(
        <HrMasterSheet open onOpenChange={vi.fn()} eyebrow="Section" title="Record" description="">
          <form onSubmit={submit}>
            <input name="value" />
            <HrDrawerActions>
              <button type="submit">Save record</button>
            </HrDrawerActions>
          </form>
        </HrMasterSheet>,
      ),
    );
    await flush();
    const save = button("Save record");
    expect(save.closest("form")).toBeNull();
    await act(async () => save.click());
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("renders in place outside a drawer", async () => {
    await act(async () =>
      root.render(
        <form>
          <HrDrawerActions>
            <button type="button">Inline action</button>
          </HrDrawerActions>
        </form>,
      ),
    );
    expect(button("Inline action").closest("form")).not.toBeNull();
  });
});
