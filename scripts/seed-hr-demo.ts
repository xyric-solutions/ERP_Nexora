/** API-only fictional HR authoring data. Never targets a normal/company database. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { NexoraApiClient } from "../app/lib/api/generated.js";

const base = new URL(process.env.NEXORA_API_BASE_URL ?? "http://127.0.0.1:4000");
const tenant = "nexora-r06-uat";
const company = "nexora-r06-uat-company";
if (!["localhost", "127.0.0.1"].includes(base.hostname) || process.env.NEXORA_UAT_CONFIRM !== tenant)
  throw new Error("This script requires a local API and explicit isolated UAT confirmation.");
const password = process.env.NEXORA_UAT_PASSWORD;
if (!password) throw new Error("NEXORA_UAT_PASSWORD is required; it is never saved in the manifest.");
const dataset = "hr-fictional-people-v1";
const date = "2026-11-02";
const reason = "Fictional HR demonstration entries for isolated UAT workflow verification.";
const directory = new URL("../tmp/hr-demo-data/", import.meta.url);
await mkdir(directory, { recursive: true });
const manifestFile = new URL("manifest.json", directory);
type Entry = { payloadHash: string; result: { id: string; [key: string]: unknown } };
const manifest: { dataset: string; tenant: string; company: string; fictional: true; entries: Record<string, Entry> } =
  {
    dataset,
    tenant,
    company,
    fictional: true,
    entries: {},
  };
try {
  const previous = JSON.parse(await readFile(manifestFile, "utf8")) as typeof manifest;
  if (previous.dataset !== dataset || previous.tenant !== tenant || previous.company !== company)
    throw new Error("The existing seed manifest belongs to another dataset.");
  manifest.entries = previous.entries;
} catch (error) {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
}

const originalFetch = globalThis.fetch;
const cookies = new Map<string, string>();
const reviewerCookies = new Map<string, string>();
let activeCookies = cookies;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== base.origin) throw new Error("The seed transport only permits the selected local API.");
  const headers = new Headers(init?.headers);
  headers.set("origin", "http://127.0.0.1:3000");
  if (activeCookies.size) headers.set("cookie", [...activeCookies].map(([key, value]) => `${key}=${value}`).join("; "));
  const response = await originalFetch(input, { ...init, headers });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const index = pair!.indexOf("=");
    activeCookies.set(pair!.slice(0, index), pair!.slice(index + 1));
  }
  return response;
};

const api = new NexoraApiClient(base.origin);
const session = await api.loginWithPassword({ identifier: process.env.NEXORA_UAT_IDENTIFIER ?? "shoaib", password });
if (session.status !== "authenticated" || session.tenant_id !== tenant || session.impersonation)
  throw new Error("A direct isolated UAT session is required.");
const csrf = session.csrf_token;
const reviewerPassword = process.env.NEXORA_UAT_REVIEWER_PASSWORD;
if (!reviewerPassword) throw new Error("The separate UAT reviewer password is required.");
activeCookies = reviewerCookies;
const reviewer = new NexoraApiClient(base.origin);
const reviewerSession = await reviewer.loginWithPassword({
  identifier: "demo.hr.reviewer",
  password: reviewerPassword,
});
if (
  reviewerSession.status !== "authenticated" ||
  reviewerSession.tenant_id !== tenant ||
  reviewerSession.user.id === session.user.id
)
  throw new Error("A separate isolated UAT reviewer is required.");
const reviewerCsrf = reviewerSession.csrf_token;
activeCookies = cookies;
async function asReviewer<T>(operation: (token: string) => Promise<T>): Promise<T> {
  activeCookies = reviewerCookies;
  try {
    return await operation(reviewerCsrf);
  } finally {
    activeCookies = cookies;
  }
}
const companies = await api.listHrCompanies();
if (!companies.items.some((item) => item.id === company))
  throw new Error("The isolated UAT company is not authorized.");

async function ensure<T extends { id: string }>(
  label: string,
  payload: unknown,
  operation: (key: string) => Promise<T>,
): Promise<T> {
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const prior = manifest.entries[label];
  if (prior) {
    if (prior.payloadHash !== payloadHash)
      throw new Error(`Seed payload changed for ${label}; use a new dataset version.`);
    return prior.result as T;
  }
  const key = createHash("sha256").update(`${dataset}:${label}`).digest("hex");
  const result = await operation(key);
  manifest.entries[label] = { payloadHash, result };
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Created ${label}`);
  return result;
}
const query = (input: Record<string, string>) => "?" + new URLSearchParams(input);
const organization = async (label: string, type: "branch" | "department", parent_id: string) => {
  const payload = { company_id: company, parent_id, type, code: "AUTO", name: label + " · Demo" };
  return ensure(label, payload, (key) => api.createHrOrganizationUnit(payload, csrf, key));
};
const karachi = await organization("Karachi Clifton Office", "branch", company);
const lahore = await organization("Lahore Gulberg Office", "branch", company);
const departments = [];
for (const [name, parent] of [
  ["People & Culture", karachi.id],
  ["Software Delivery", karachi.id],
  ["Finance & Accounts", karachi.id],
  ["Customer Success", lahore.id],
] as const)
  departments.push(await organization(name, "department", parent));
// Persist sequential mutations so interruption cannot lose part of the manifest.
const designations = [];
for (const name of [
  "HR Manager",
  "Software Engineer",
  "Finance Executive",
  "Client Support Specialist",
  "Sales Executive",
  "Operations Coordinator",
]) {
  const payload = {
    company_id: company,
    type: "designation" as const,
    code: "AUTO",
    name: name + " · Demo",
    description: reason,
  };
  designations.push(await ensure(name, payload, (key) => api.createHrMaster(payload, csrf, key)));
}
const grades = [];
for (const [name, level, minimum, midpoint, maximum] of [
  ["Associate", 1, "60000", "90000", "120000"],
  ["Professional", 2, "100000", "150000", "200000"],
  ["Manager", 3, "160000", "210000", "260000"],
] as const) {
  const payload = {
    company_id: company,
    code: "AUTO",
    name: name + " · Demo",
    description: reason,
    grade_level: level,
    currency_code: "PKR",
    band_minimum: minimum,
    band_midpoint: midpoint,
    band_maximum: maximum,
  };
  grades.push(await ensure("Grade " + name, payload, (key) => api.createHrJobGrade(payload, csrf, key)));
}
const locationPayload = {
  company_id: company,
  type: "work_location" as const,
  code: "AUTO",
  name: "Karachi Office · Demo",
  description: reason,
  configuration_key: "working_pattern" as const,
  configuration_value: "on_site",
};
const workLocation = await ensure("Karachi Office", locationPayload, (key) => api.createHrMaster(locationPayload, csrf, key));
const setupPayload = {
  company_id: company,
  type: "employment_setup" as const,
  code: "AUTO",
  name: "Permanent Monthly Staff · Demo",
  description: reason,
  payment_route: "payroll" as const,
  pay_cycle: "monthly" as const,
};
const employmentSetup = await ensure("Permanent Monthly Staff", setupPayload, (key) =>
  api.createHrMaster(setupPayload, csrf, key),
);
const costCentres = await api.listHrMasters(query({ company_id: company, type: "cost_center", active_only: "true" }));
if (!costCentres.items[0]) throw new Error("An active company cost centre is required for profile draft assignments.");
const jobPayload = {
  company_id: company,
  type: "job" as const,
  code: "AUTO",
  name: "Professional Services Role · Demo",
  description: reason,
};
const job = await ensure("Job Professional Services", jobPayload, (key) => api.createHrMaster(jobPayload, csrf, key));
const lifecycle = { company_id: company, code: "AUTO", name: "Permanent Staff Lifecycle · Demo", effective_from: date };
const policy = await ensure("Lifecycle policy", lifecycle, (key) =>
  api.createHrEmploymentLifecyclePolicy(lifecycle, csrf, key),
);
const policies = await api.listHrEmploymentLifecyclePolicies(query({ company_id: company }));
if (
  !policies.items.some(
    (item) =>
      item.status === "active" && item.effective_from <= date && (!item.effective_to || item.effective_to >= date),
  )
) {
  await ensure("Submit lifecycle policy", { reason }, (key) =>
    api.submitHrEmploymentLifecyclePolicy(policy.id, { reason }, csrf, key),
  );
  await ensure("Approve lifecycle policy", { reason }, (key) =>
    asReviewer((token) => reviewer.approveHrEmploymentLifecyclePolicy(policy.id, { reason }, token, key)),
  );
  await ensure("Activate lifecycle policy", { reason }, (key) =>
    asReviewer((token) => reviewer.activateHrEmploymentLifecyclePolicy(policy.id, { reason }, token, key)),
  );
}
const people = [
  ["Ayesha", "Khan", 0, 2, 0],
  ["Hamza", "Ahmed", 1, 1, 1],
  ["Fatima", "Noor", 2, 1, 2],
  ["Bilal", "Hassan", 3, 0, 3],
  ["Zainab", "Iqbal", 4, 1, 3],
  ["Usman", "Ali", 5, 0, 3],
  ["Maryam", "Saeed", 1, 1, 1],
  ["Haris", "Malik", 3, 0, 3],
] as const;
for (const [index, [first_name, last_name, designation, grade, department]] of people.entries()) {
  const slug = `${first_name}.${last_name}`.toLowerCase();
  const payload = {
    company_id: company,
    employee_number: "AUTO",
    first_name,
    last_name,
    joined_on: "2026-10-01",
    work_email: `${slug}@nexora-demo.example.test`,
    phone: `0300 000 01${String(index).padStart(2, "0")} (demo)`,
  };
  const person = await ensure(`Employee ${slug}`, payload, (key) => api.createHrEmployeeDraft(payload, csrf, key));
  if (index < 6)
    await ensure(`Submit ${slug}`, { reason }, (key) => api.submitHrEmployeeDraft(person.id, { reason }, csrf, key));
  if (index >= 4) continue;
  const approval = { decision: "approved" as const, reason };
  await ensure(`Approve ${slug}`, approval, (key) =>
    asReviewer((token) => reviewer.decideHrEmployeeDraftApproval(person.id, approval, token, key)),
  );
  const assignment = {
    company_id: company,
    branch_id: department === 3 ? lahore.id : karachi.id,
    department_id: departments[department]!.id,
    designation_id: designations[designation]!.id,
    job_grade_id: grades[grade]!.id,
    cost_center_id: costCentres.items[0].id,
    work_location_id: workLocation.id,
    employment_setup_id: employmentSetup.id,
    effective_from: date,
  };
  const placement = await ensure(`Assignment ${slug}`, assignment, (key) =>
    api.createHrProfileDraftAssignment(person.id, assignment, csrf, key),
  );
  const hirePayload = {
    company_id: company,
    job_id: job.id,
    profile_draft_assignment_id: placement.id,
    effective_on: date,
    reason,
  };
  const hire = await ensure(`Hire ${slug}`, hirePayload, (key) =>
    api.createHrEmployeeHireRequest(person.id, hirePayload, csrf, key),
  );
  await ensure(`Approve hire ${slug}`, approval, (key) =>
    asReviewer((token) => reviewer.decideHrEmployeeHireRequest(person.id, hire.id, approval, token, key)),
  );
  const contact = {
    channel: "email" as const,
    contact_usage: "personal" as const,
    contact_value: `${slug}@personal.example.test`,
    label: "Fictional personal email",
    is_primary: true,
  };
  await ensure(`Contact ${slug}`, contact, (key) => api.createHrEmployeeContact(person.id, contact, csrf, key));
  const emergency = {
    name: `${first_name === "Ayesha" ? "Imran" : "Sana"} ${last_name} (Demo)`,
    relationship: "Sibling",
    phone: `0301 000 01${String(index).padStart(2, "0")} (demo)`,
    priority: 1,
    is_primary: true,
  };
  await ensure(`Emergency ${slug}`, emergency, (key) =>
    api.createHrEmployeeEmergencyContact(person.id, emergency, csrf, key),
  );
}
for (const [first_name, last_name, source] of [
  ["Sara", "Raza", "referral"],
  ["Ahmed", "Farooq", "job_board"],
  ["Hina", "Aslam", "direct"],
  ["Omar", "Shah", "referral"],
] as const) {
  const payload = {
    company_id: company,
    first_name: first_name!,
    last_name: last_name!,
    email: `${first_name}.${last_name}@candidates.example.test`.toLowerCase(),
    phone: "0302 000 0100 (demo)",
    source: source!,
  };
  await ensure(`Candidate ${first_name}`, payload, (key) => api.createHrCandidate(payload, csrf, key));
}
for (const [name, annual] of [
  ["Annual Leave", "20"],
  ["Sick Leave", "10"],
  ["Unpaid Leave", "0"],
]) {
  const payload = {
    company_id: company,
    code: "AUTO",
    name: `${name} · Demo`,
    paid: annual !== "0",
    policy: {
      effective_from: date,
      annual_entitlement_days: annual!,
      accrual_method: "annual_grant" as const,
      carry_forward: false,
      maximum_carry_forward_days: "0",
      maximum_balance_days: annual!,
      minimum_request_days: "0.5",
      maximum_request_days: "30",
      requires_hr_approval: true,
      applicable_employment_setup_ids: [],
      applicable_genders: [],
      document_required_after_days: null,
    },
    reason,
  };
  await ensure(`Leave ${name}`, payload, (key) => api.timeLeaveCreateLeaveType(payload, csrf, key));
}
const shift = {
  company_id: company,
  code: "AUTO",
  name: "Office Day Shift · Demo",
  kind: "fixed" as const,
  start_minute: 540,
  end_minute: 1080,
  required_work_minutes: 480,
  grace_in_minutes: 10,
  grace_out_minutes: 5,
  minimum_present_minutes: 120,
  half_day_minutes: 240,
  overtime_after_minutes: 30,
  weekly_off_days: [0, 6],
  breaks: [{ label: "Lunch", minutes: 60, paid: false }],
  time_zone: "Asia/Karachi",
  work_location_id: workLocation.id,
  reason,
};
await ensure("Office shift", shift, (key) => api.createHrShift(shift, csrf, key));
for (const [name, category] of [
  ["Workplace Safety & Conduct", "Compliance"],
  ["Customer Communication Skills", "Technical"],
  ["People Leadership Essentials", "Leadership"],
] as const) {
  const payload = {
    action: "create" as const,
    company_id: company,
    expected_version: 0,
    terms: {
      kind: "programme" as const,
      code: "AUTO",
      name: `${name} · Demo`,
      objectives: "Demonstrate safe, respectful and effective working practices using realistic workplace examples.",
      category,
      delivery_mode: "Classroom" as const,
      provider: "Nexora Learning Team · Demo",
      duration_minutes: 180,
      cost_per_participant: "2500.00",
      currency: "PKR",
      mandatory: category === "Compliance",
      minimum_attendance_percent: 80,
      pass_mark: 70,
      validity_months: 12,
      prerequisite_ids: [],
    },
    reason,
  };
  await ensure(`Learning ${name}`, payload, (key) => api.actOnLearning(payload, csrf, key));
}
const cycle = {
  action: "save" as const,
  company_id: company,
  record_id: null,
  expected_version: 0,
  terms: {
    kind: "cycle" as const,
    title: "2026 Annual Performance Review · Demo",
    description: "Fictional evidence-based delivery, service and development reviews.",
    start_date: "2026-01-01",
    end_date: "2026-12-15",
    review_due_date: "2026-12-31",
  },
  reason,
};
await ensure("Performance cycle", cycle, (key) => api.actOnPerformance(cycle, csrf, key));
const cycleId = manifest.entries["Performance cycle"]!.result.id;
const activateCycle = {
  action: "activate" as const,
  company_id: company,
  record_id: cycleId,
  expected_version: 1,
  reason,
};
await ensure("Activate performance cycle", activateCycle, (key) => api.actOnPerformance(activateCycle, csrf, key));
for (const slug of ["ayesha.khan", "hamza.ahmed"]) {
  const goal = {
    action: "save" as const,
    company_id: company,
    record_id: null,
    expected_version: 0,
    terms: {
      kind: "goal" as const,
      cycle_id: cycleId,
      employee_id: manifest.entries[`Employee ${slug}`]!.result.id,
      title: slug === "ayesha.khan" ? "Improve new-hire onboarding quality" : "Deliver reliable customer releases",
      measure: "At least 95% of agreed deliverables accepted on time",
      target: "95%",
      weight_bps: 10000,
      due_date: "2026-12-15",
    },
    reason,
  };
  await ensure(`Goal ${slug}`, goal, (key) => api.actOnPerformance(goal, csrf, key));
}
const allocation = {
  company_id: company,
  scope: "employee" as const,
  scope_id: manifest.entries["Employee hamza.ahmed"]!.result.id,
  shift_id: manifest.entries["Office shift"]!.result.id,
  effective_from: date,
  effective_to: null,
  reason,
  replace_assignment_id: null,
  expected_replace_version: null,
};
await ensure("Software delivery shift allocation", allocation, (key) =>
  api.createHrShiftAllocation(allocation, csrf, key),
);
for (const [title, designation, department, branch, submit] of [
  ["Software Engineer", 1, 1, karachi.id, true],
  ["Customer Support Specialist", 3, 3, lahore.id, false],
] as const) {
  const request = {
    company_id: company,
    job_title: title + " · Demo",
    designation_id: designations[designation]!.id,
    job_grade_id: grades[1]!.id,
    employment_setup_id: employmentSetup.id,
    branch_id: branch,
    department_id: departments[department]!.id,
    positions_requested: 2,
    position_type: "new_position" as const,
    salary_minimum: "100000.00",
    salary_maximum: "180000.00",
    currency_code: "PKR",
    target_start_date: "2026-12-01",
    reason,
    required_skills: submit
      ? ["TypeScript", "API integration", "Team communication"]
      : ["Customer service", "Written communication"],
  };
  const requisition = await ensure(`Requisition ${title}`, request, (key) =>
    api.createHrManpowerRequisition(request, csrf, key),
  );
  if (!submit) continue;
  await ensure(`Submit requisition ${title}`, { reason }, (key) =>
    api.submitHrManpowerRequisition(requisition.id, { reason }, csrf, key),
  );
  const approval = { decision: "approved" as const, reason };
  await ensure(`Approve requisition ${title}`, approval, (key) =>
    asReviewer((token) => reviewer.decideHrManpowerRequisition(requisition.id, approval, token, key)),
  );
  const opening = {
    company_id: company,
    requisition_id: requisition.id,
    title: title + " · Demo",
    positions_requested: 2,
    channels: ["Company website", "Employee referrals"],
    closing_on: "2026-11-25",
  };
  const vacancy = await ensure(`Opening ${title}`, opening, (key) => api.createHrJobOpening(opening, csrf, key));
  for (const candidate of ["Sara", "Ahmed"]) {
    const application = {
      company_id: company,
      candidate_id: manifest.entries[`Candidate ${candidate}`]!.result.id,
      opening_id: vacancy.id,
    };
    const applied = await ensure(`Application ${candidate}`, application, (key) =>
      api.createHrApplication(application, csrf, key),
    );
    const screening = {
      company_id: company,
      expected_stage: "application" as const,
      stage: "screening" as const,
      reason,
    };
    await ensure(`Screening ${candidate}`, screening, (key) =>
      api.changeHrApplicationStage(applied.id, screening, csrf, key),
    );
  }
}
const programmeId = manifest.entries["Learning Workplace Safety & Conduct"]!.result.id;
const publish = { action: "activate" as const, company_id: company, id: programmeId, expected_version: 1, reason };
await ensure("Publish workplace learning", publish, (key) =>
  asReviewer((token) => reviewer.actOnLearning(publish, token, key)),
);
const trainingSession = {
  action: "create" as const,
  company_id: company,
  expected_version: 0,
  terms: {
    kind: "session" as const,
    programme_id: programmeId,
    title: "Workplace Safety Workshop · Demo",
    trainer: "Ayesha Khan · Demo",
    location: "Karachi Clifton Office · Demo",
    capacity: 12,
    slots: [{ starts_at: "2026-11-09T09:00:00+05:00", ends_at: "2026-11-09T12:00:00+05:00" }],
  },
  reason,
};
await ensure("Training workshop", trainingSession, (key) => api.actOnLearning(trainingSession, csrf, key));
console.log(
  JSON.stringify({
    dataset,
    company,
    operations: Object.keys(manifest.entries).length,
    fictionalEmployees: people.length,
    activeEmployees: 4,
    pendingProfileApprovals: 2,
    remainingEmployeeDrafts: 2,
    financialPosting: false,
    manifest: "tmp/hr-demo-data/manifest.json",
  }),
);
