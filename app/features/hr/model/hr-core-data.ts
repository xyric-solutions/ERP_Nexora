/**
 * Core HR foundation fixtures for the isolated Nexora UI/UX prototype.
 *
 * This is the visual specification of Phase 1 of the HR architecture
 * (docs/business/hr-core-foundation-design.md in the main repository), and it
 * deliberately models the same shapes the backend does, because a prototype
 * that shows an impossible screen is worse than no prototype:
 *
 *   - An employee carries NO organizational fields. Company, branch,
 *     department, designation, grade, cost centre, location, employment type,
 *     category and reporting manager all live on effective-dated assignment
 *     rows, and the current values are derived from the latest row on or
 *     before a given date. There is no current-value field to overwrite, so
 *     "never overwrite historical information" holds by construction.
 *   - Status is a lifecycle with legal transitions, not a boolean.
 *   - Masters are deactivated, never deleted, and a master in use says so.
 *   - Sensitive values (national ID, bank account, tax number) are masked
 *     everywhere except the one place a permitted role reveals them.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

export type MasterStatus = "Active" | "Inactive";

export type EmployeeStatus =
  | "Draft"
  | "Pending approval"
  | "Active"
  | "Probation"
  | "Confirmed"
  | "Suspended"
  | "Resigned"
  | "Terminated"
  | "Inactive";

export type ChangeReason =
  | "Initial appointment"
  | "Transfer"
  | "Promotion"
  | "Demotion"
  | "Manager change"
  | "Employment type change"
  | "Grade revision"
  | "Cost centre change"
  | "Status change";

/* ------------------------------------------------------------------ */
/* Status lifecycle                                                    */
/* ------------------------------------------------------------------ */

/**
 * The only transitions the product allows. Written as data rather than as
 * screen logic so the same table can be shown to a reviewer, asserted by a
 * test, and used to decide which buttons a record offers.
 */
export const employeeStatusTransitions: Readonly<Record<EmployeeStatus, readonly EmployeeStatus[]>> = {
  "Draft": ["Pending approval", "Inactive"],
  "Pending approval": ["Active", "Probation", "Draft"],
  "Active": ["Probation", "Confirmed", "Suspended", "Resigned", "Terminated"],
  "Probation": ["Confirmed", "Suspended", "Resigned", "Terminated"],
  "Confirmed": ["Suspended", "Resigned", "Terminated"],
  "Suspended": ["Active", "Confirmed", "Resigned", "Terminated"],
  "Resigned": ["Inactive"],
  "Terminated": ["Inactive"],
  "Inactive": [],
};

export const employeeStatuses = Object.keys(employeeStatusTransitions) as readonly EmployeeStatus[];

/** Statuses that count as employed for headcount and for master usage. */
export const employedStatuses: readonly EmployeeStatus[] = [
  "Active",
  "Probation",
  "Confirmed",
  "Suspended",
];

export function canTransition(from: EmployeeStatus, to: EmployeeStatus): boolean {
  return employeeStatusTransitions[from].includes(to);
}

/* ------------------------------------------------------------------ */
/* Organisation structure and masters                                  */
/* ------------------------------------------------------------------ */

export type OrgUnitType = "Company" | "Branch" | "Department";

export interface OrgUnit {
  id: string;
  parentId: string | null;
  type: OrgUnitType;
  code: string;
  name: string;
  status: MasterStatus;
  head: string;
  createdOn: string;
}

/**
 * One tree, not three tables: company, branch and department are the same
 * structure at different depths, which is how Finance and Operations already
 * read it. Two writable copies of an org chart is how HR and Finance end up
 * disagreeing about which department a cost belongs to.
 */
export const orgUnits: readonly OrgUnit[] = [
  { id: "ORG-CO-001", parentId: null, type: "Company", code: "NS", name: "Nexora Services (Private) Limited", status: "Active", head: "Omar Siddiqui", createdOn: "01 Jan 2021" },
  { id: "ORG-BR-001", parentId: "ORG-CO-001", type: "Branch", code: "NS-ISB", name: "Islamabad Head Office", status: "Active", head: "Mariam Ali", createdOn: "01 Jan 2021" },
  { id: "ORG-BR-002", parentId: "ORG-CO-001", type: "Branch", code: "NS-LHR", name: "Lahore Delivery Centre", status: "Active", head: "Bilal Khan", createdOn: "14 Mar 2022" },
  { id: "ORG-BR-003", parentId: "ORG-CO-001", type: "Branch", code: "NS-KHI", name: "Karachi Client Office", status: "Inactive", head: "Hassan Raza", createdOn: "02 Sep 2023" },
  { id: "ORG-DP-001", parentId: "ORG-BR-001", type: "Department", code: "FIN", name: "Finance & Accounts", status: "Active", head: "Mariam Ali", createdOn: "01 Jan 2021" },
  { id: "ORG-DP-002", parentId: "ORG-BR-001", type: "Department", code: "HRD", name: "Human Resources", status: "Active", head: "Sana Iqbal", createdOn: "01 Jan 2021" },
  { id: "ORG-DP-003", parentId: "ORG-BR-001", type: "Department", code: "TEC", name: "Technology & Delivery", status: "Active", head: "Bilal Khan", createdOn: "01 Jan 2021" },
  { id: "ORG-DP-004", parentId: "ORG-BR-002", type: "Department", code: "OPS", name: "Service Operations", status: "Active", head: "Ayesha Malik", createdOn: "14 Mar 2022" },
  { id: "ORG-DP-005", parentId: "ORG-BR-002", type: "Department", code: "CMR", name: "Commercial", status: "Active", head: "Hassan Raza", createdOn: "20 Jun 2022" },
  { id: "ORG-DP-006", parentId: "ORG-BR-003", type: "Department", code: "SUP", name: "Client Support", status: "Inactive", head: "Hassan Raza", createdOn: "02 Sep 2023" },
  { id: "ORG-DP-007", parentId: "ORG-BR-002", type: "Department", code: "DEL", name: "Delivery Engineering", status: "Active", head: "Bilal Khan", createdOn: "14 Mar 2022" },
];

export function orgUnit(id: string): OrgUnit | undefined {
  return orgUnits.find((unit) => unit.id === id);
}

export function orgUnitName(id: string): string {
  return orgUnit(id)?.name ?? "—";
}

/** The company a branch or department ultimately belongs to. */
export function companyOf(id: string): OrgUnit | undefined {
  let unit = orgUnit(id);
  while (unit && unit.parentId) {
    unit = orgUnit(unit.parentId);
  }
  return unit;
}

export function childrenOf(id: string | null): readonly OrgUnit[] {
  return orgUnits.filter((unit) => unit.parentId === id);
}

export interface MasterRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  status: MasterStatus;
  createdOn: string;
  createdBy: string;
  /** Extra column shown on that master's list, keyed by the master. */
  detail: string;
}

export interface MasterDefinition {
  id: string;
  pageId: string;
  label: string;
  singular: string;
  /** Header for the master-specific column. */
  detailLabel: string;
  description: string;
  records: readonly MasterRecord[];
}

const designations: readonly MasterRecord[] = [
  { id: "DSG-001", code: "CFO", name: "Chief Financial Officer", description: "Executive ownership of finance and treasury", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Executive" },
  { id: "DSG-002", code: "FMG", name: "Finance Manager", description: "Owns the ledger, close and controls", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Management" },
  { id: "DSG-003", code: "ACC", name: "Accountant", description: "Journals, reconciliations and schedules", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Professional" },
  { id: "DSG-004", code: "HRM", name: "HR Manager", description: "Owns the employee lifecycle and policy", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Management" },
  { id: "DSG-005", code: "HRO", name: "HR Officer", description: "Maintains employee records and documents", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Professional" },
  { id: "DSG-006", code: "SDE", name: "Senior Software Engineer", description: "Delivery of client engineering work", status: "Active", createdOn: "14 Mar 2022", createdBy: "Sana Iqbal", detail: "Professional" },
  { id: "DSG-007", code: "SEN", name: "Software Engineer", description: "Delivery of client engineering work", status: "Active", createdOn: "14 Mar 2022", createdBy: "Sana Iqbal", detail: "Professional" },
  { id: "DSG-008", code: "OPM", name: "Operations Manager", description: "Service operations and client delivery", status: "Active", createdOn: "20 Jun 2022", createdBy: "Sana Iqbal", detail: "Management" },
  { id: "DSG-009", code: "CSA", name: "Client Support Associate", description: "First-line client support", status: "Inactive", createdOn: "02 Sep 2023", createdBy: "Sana Iqbal", detail: "Support" },
];

const jobGrades: readonly MasterRecord[] = [
  { id: "GRD-001", code: "G1", name: "Grade 1 — Executive", description: "Board and executive committee", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Level 1" },
  { id: "GRD-002", code: "G2", name: "Grade 2 — Senior management", description: "Function heads", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Level 2" },
  { id: "GRD-003", code: "G3", name: "Grade 3 — Management", description: "Department and team managers", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Level 3" },
  { id: "GRD-004", code: "G4", name: "Grade 4 — Senior professional", description: "Senior individual contributors", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Level 4" },
  { id: "GRD-005", code: "G5", name: "Grade 5 — Professional", description: "Qualified individual contributors", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Level 5" },
  { id: "GRD-006", code: "G6", name: "Grade 6 — Associate", description: "Entry and support roles", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Level 6" },
];

const costCentres: readonly MasterRecord[] = [
  { id: "CCT-001", code: "CC-FIN", name: "Finance & Administration", description: "Corporate finance and administration", status: "Active", createdOn: "01 Jan 2021", createdBy: "Mariam Ali", detail: "60-07-00100" },
  { id: "CCT-002", code: "CC-HRD", name: "People & Culture", description: "Human resources and training", status: "Active", createdOn: "01 Jan 2021", createdBy: "Mariam Ali", detail: "60-01-00100" },
  { id: "CCT-003", code: "CC-DEL", name: "Client Delivery", description: "Billable engineering delivery", status: "Active", createdOn: "01 Jan 2021", createdBy: "Mariam Ali", detail: "50-03-00100" },
  { id: "CCT-004", code: "CC-OPS", name: "Service Operations", description: "Managed services and support", status: "Active", createdOn: "14 Mar 2022", createdBy: "Mariam Ali", detail: "50-01-00100" },
  { id: "CCT-005", code: "CC-CMR", name: "Commercial & Growth", description: "Sales, marketing and partnerships", status: "Active", createdOn: "20 Jun 2022", createdBy: "Mariam Ali", detail: "60-02-00100" },
  { id: "CCT-006", code: "CC-KHI", name: "Karachi Support Desk", description: "Closed with the Karachi office", status: "Inactive", createdOn: "02 Sep 2023", createdBy: "Mariam Ali", detail: "50-01-00100" },
];

const workLocations: readonly MasterRecord[] = [
  { id: "LOC-001", code: "ISB-HO", name: "Islamabad Head Office", description: "Blue Area, Islamabad", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "On site" },
  { id: "LOC-002", code: "LHR-DC", name: "Lahore Delivery Centre", description: "Gulberg, Lahore", status: "Active", createdOn: "14 Mar 2022", createdBy: "Sana Iqbal", detail: "On site" },
  { id: "LOC-003", code: "REMOTE", name: "Remote — Pakistan", description: "Home based within Pakistan", status: "Active", createdOn: "05 Apr 2022", createdBy: "Sana Iqbal", detail: "Remote" },
  { id: "LOC-004", code: "HYBRID", name: "Hybrid — Islamabad", description: "Three days on site", status: "Active", createdOn: "05 Apr 2022", createdBy: "Sana Iqbal", detail: "Hybrid" },
  { id: "LOC-005", code: "CLIENT", name: "Client premises", description: "Deployed to a client site", status: "Active", createdOn: "20 Jun 2022", createdBy: "Sana Iqbal", detail: "On site" },
  { id: "LOC-006", code: "KHI-CO", name: "Karachi Client Office", description: "Closed September 2026", status: "Inactive", createdOn: "02 Sep 2023", createdBy: "Sana Iqbal", detail: "On site" },
];

const employmentTypes: readonly MasterRecord[] = [
  { id: "EMT-001", code: "PERM", name: "Permanent", description: "Open-ended contract of employment", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Payroll" },
  { id: "EMT-002", code: "PROB", name: "Probationary", description: "Confirmation required before permanence", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Payroll" },
  { id: "EMT-003", code: "CONT", name: "Fixed-term contract", description: "Dated contract with an end date", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Payroll" },
  { id: "EMT-004", code: "PART", name: "Part time", description: "Reduced contracted hours", status: "Active", createdOn: "14 Mar 2022", createdBy: "Sana Iqbal", detail: "Payroll" },
  { id: "EMT-005", code: "INTN", name: "Internship", description: "Fixed programme, stipend paid", status: "Active", createdOn: "01 Jul 2023", createdBy: "Sana Iqbal", detail: "Stipend" },
  { id: "EMT-006", code: "CONS", name: "Consultant", description: "Engaged on invoice, not payroll", status: "Active", createdOn: "01 Jul 2023", createdBy: "Sana Iqbal", detail: "Accounts payable" },
];

const employeeCategories: readonly MasterRecord[] = [
  { id: "CAT-001", code: "MGT", name: "Management", description: "Function and department heads", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Monthly" },
  { id: "CAT-002", code: "STF", name: "Staff", description: "Salaried professional staff", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Monthly" },
  { id: "CAT-003", code: "SUP", name: "Support", description: "Administration and facilities", status: "Active", createdOn: "01 Jan 2021", createdBy: "Sana Iqbal", detail: "Monthly" },
  { id: "CAT-004", code: "TRN", name: "Trainee", description: "Graduate and internship programme", status: "Active", createdOn: "01 Jul 2023", createdBy: "Sana Iqbal", detail: "Stipend" },
];

export const hrMasters: readonly MasterDefinition[] = [
  { id: "designation", pageId: "designations", label: "Designations", singular: "Designation", detailLabel: "Band", description: "Job titles an employee can hold. Used by the employee master, approval routing and headcount reporting.", records: designations },
  { id: "job-grade", pageId: "job-grades", label: "Job Grades", singular: "Job grade", detailLabel: "Level", description: "Salary and seniority levels. Grades drive approval thresholds and pay bands when payroll is added.", records: jobGrades },
  { id: "cost-centre", pageId: "cost-centres", label: "Cost Centres", singular: "Cost centre", detailLabel: "Default nominal", description: "The finance dimension employee cost is charged to. A cost centre may span branches, so it is not part of the org tree.", records: costCentres },
  { id: "work-location", pageId: "work-locations", label: "Work Locations", singular: "Work location", detailLabel: "Working pattern", description: "Where an employee is based. Separate from branch: a Lahore employee may be remote.", records: workLocations },
  { id: "employment-type", pageId: "employment-types", label: "Employment Types", singular: "Employment type", detailLabel: "Paid through", description: "The contractual basis of employment. Determines whether payroll or accounts payable pays the person.", records: employmentTypes },
  { id: "employee-category", pageId: "employee-categories", label: "Employee Categories", singular: "Employee category", detailLabel: "Pay cycle", description: "Grouping for policy, benefits and reporting.", records: employeeCategories },
];

export function masterByPageId(pageId: string): MasterDefinition | undefined {
  return hrMasters.find((master) => master.pageId === pageId);
}

export function masterRecord(masterId: string, recordId: string): MasterRecord | undefined {
  return hrMasters.find((master) => master.id === masterId)?.records.find((record) => record.id === recordId);
}

/* ------------------------------------------------------------------ */
/* Employees                                                           */
/* ------------------------------------------------------------------ */

export interface EmployeeAssignment {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  companyId: string;
  branchId: string;
  departmentId: string;
  designationId: string;
  jobGradeId: string;
  costCentreId: string;
  workLocationId: string;
  employmentTypeId: string;
  employeeCategoryId: string;
  reportingManagerId: string | null;
  changeReason: ChangeReason;
  approvedBy: string;
  approvalReference: string;
}

export interface EmployeeStatusEvent {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  fromStatus: EmployeeStatus | null;
  toStatus: EmployeeStatus;
  reason: string;
  approvedBy: string;
  approvalReference: string;
}

export interface EmployeeDocument {
  id: string;
  title: string;
  category: "Identity" | "Contract" | "Qualification" | "Compliance";
  reference: string;
  issuedOn: string;
  expiresOn: string | null;
  uploadedBy: string;
  restricted: boolean;
}

export interface EmployeeDependent {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth: string;
  covered: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  isPrimary: boolean;
}

export interface EmployeeBankAccount {
  id: string;
  bankName: string;
  branch: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  currency: string;
  isPrimary: boolean;
  verifiedOn: string | null;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  /* Personal */
  firstName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  nationality: string;
  nationalId: string;
  /* Contact */
  workEmail: string;
  personalEmail: string;
  mobile: string;
  addressLine: string;
  city: string;
  country: string;
  /* Employment */
  joinedOn: string;
  probationEndsOn: string | null;
  confirmedOn: string | null;
  contractEndsOn: string | null;
  noticePeriodDays: number;
  /* Tax */
  taxIdentifier: string;
  taxStatus: string;
  taxExemptionCode: string;
  /* Lifecycle */
  status: EmployeeStatus;
  createdBy: string;
  createdOn: string;
  /* Satellites */
  bankAccounts: readonly EmployeeBankAccount[];
  emergencyContacts: readonly EmergencyContact[];
  dependents: readonly EmployeeDependent[];
  documents: readonly EmployeeDocument[];
}

export const employees: readonly Employee[] = [
  {
    id: "EMP-1", employeeNumber: "EMP-000001",
    firstName: "Omar", lastName: "Siddiqui", preferredName: "Omar", dateOfBirth: "1979-04-12", gender: "Male", maritalStatus: "Married", nationality: "Pakistani", nationalId: "6110187654321",
    workEmail: "omar.siddiqui@nexora.example", personalEmail: "o.siddiqui@example.com", mobile: "+92 300 1234567", addressLine: "House 14, Street 22, F-7/2", city: "Islamabad", country: "Pakistan",
    joinedOn: "2021-01-04", probationEndsOn: null, confirmedOn: "2021-01-04", contractEndsOn: null, noticePeriodDays: 90,
    taxIdentifier: "3520212345678", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Confirmed", createdBy: "Sana Iqbal", createdOn: "04 Jan 2021",
    bankAccounts: [{ id: "EBA-1", bankName: "First Meridian Bank", branch: "Blue Area", accountTitle: "Omar Siddiqui", accountNumber: "00114471889201", iban: "PK36FMER0000114471889201", currency: "USD", isPrimary: true, verifiedOn: "2021-01-06" }],
    emergencyContacts: [{ id: "EC-1", name: "Nadia Siddiqui", relationship: "Spouse", phone: "+92 300 7654321", isPrimary: true }],
    dependents: [
      { id: "DEP-1", name: "Hania Siddiqui", relationship: "Daughter", dateOfBirth: "2012-08-19", covered: true },
      { id: "DEP-2", name: "Yusuf Siddiqui", relationship: "Son", dateOfBirth: "2015-02-03", covered: true },
    ],
    documents: [
      { id: "DOC-1", title: "National identity card", category: "Identity", reference: "CNIC-6110187654321", issuedOn: "2019-05-02", expiresOn: "2029-05-01", uploadedBy: "Sana Iqbal", restricted: true },
      { id: "DOC-2", title: "Employment contract", category: "Contract", reference: "CON-2021-0001", issuedOn: "2021-01-04", expiresOn: null, uploadedBy: "Sana Iqbal", restricted: true },
    ],
  },
  {
    id: "EMP-2", employeeNumber: "EMP-000002",
    firstName: "Mariam", lastName: "Ali", preferredName: "Mariam", dateOfBirth: "1986-09-30", gender: "Female", maritalStatus: "Married", nationality: "Pakistani", nationalId: "6110123456789",
    workEmail: "mariam.ali@nexora.example", personalEmail: "m.ali@example.com", mobile: "+92 301 2223344", addressLine: "Apartment 8B, Diplomatic Enclave", city: "Islamabad", country: "Pakistan",
    joinedOn: "2021-02-01", probationEndsOn: null, confirmedOn: "2021-08-01", contractEndsOn: null, noticePeriodDays: 60,
    taxIdentifier: "3520298765432", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Confirmed", createdBy: "Sana Iqbal", createdOn: "01 Feb 2021",
    bankAccounts: [{ id: "EBA-2", bankName: "First Meridian Bank", branch: "Blue Area", accountTitle: "Mariam Ali", accountNumber: "00114471553902", iban: "PK36FMER0000114471553902", currency: "USD", isPrimary: true, verifiedOn: "2021-02-03" }],
    emergencyContacts: [{ id: "EC-2", name: "Faisal Ali", relationship: "Spouse", phone: "+92 321 5556677", isPrimary: true }],
    dependents: [{ id: "DEP-3", name: "Zara Ali", relationship: "Daughter", dateOfBirth: "2018-11-22", covered: true }],
    documents: [
      { id: "DOC-3", title: "National identity card", category: "Identity", reference: "CNIC-6110123456789", issuedOn: "2020-01-15", expiresOn: "2030-01-14", uploadedBy: "Sana Iqbal", restricted: true },
      { id: "DOC-4", title: "Chartered accountant certificate", category: "Qualification", reference: "ICAP-118842", issuedOn: "2012-06-30", expiresOn: null, uploadedBy: "Mariam Ali", restricted: false },
    ],
  },
  {
    id: "EMP-3", employeeNumber: "EMP-000003",
    firstName: "Bilal", lastName: "Khan", preferredName: "Bilal", dateOfBirth: "1988-01-17", gender: "Male", maritalStatus: "Single", nationality: "Pakistani", nationalId: "3520155443322",
    workEmail: "bilal.khan@nexora.example", personalEmail: "b.khan@example.com", mobile: "+92 333 8889900", addressLine: "12-C Gulberg III", city: "Lahore", country: "Pakistan",
    joinedOn: "2022-03-14", probationEndsOn: null, confirmedOn: "2022-09-14", contractEndsOn: null, noticePeriodDays: 60,
    taxIdentifier: "3520155443322", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Confirmed", createdBy: "Sana Iqbal", createdOn: "14 Mar 2022",
    bankAccounts: [{ id: "EBA-3", bankName: "Northgate Bank", branch: "Gulberg", accountTitle: "Bilal Khan", accountNumber: "00226011447700", iban: "PK29NRTG0000226011447700", currency: "USD", isPrimary: true, verifiedOn: "2022-03-18" }],
    emergencyContacts: [{ id: "EC-3", name: "Sadia Khan", relationship: "Sister", phone: "+92 345 1112233", isPrimary: true }],
    dependents: [],
    documents: [{ id: "DOC-5", title: "Employment contract", category: "Contract", reference: "CON-2022-0014", issuedOn: "2022-03-14", expiresOn: null, uploadedBy: "Sana Iqbal", restricted: true }],
  },
  {
    id: "EMP-4", employeeNumber: "EMP-000004",
    firstName: "Sana", lastName: "Iqbal", preferredName: "Sana", dateOfBirth: "1990-06-05", gender: "Female", maritalStatus: "Married", nationality: "Pakistani", nationalId: "6110199887766",
    workEmail: "sana.iqbal@nexora.example", personalEmail: "s.iqbal@example.com", mobile: "+92 302 4445566", addressLine: "House 3, Street 9, G-9/1", city: "Islamabad", country: "Pakistan",
    joinedOn: "2021-01-11", probationEndsOn: null, confirmedOn: "2021-07-11", contractEndsOn: null, noticePeriodDays: 60,
    taxIdentifier: "3520233445566", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Confirmed", createdBy: "Omar Siddiqui", createdOn: "11 Jan 2021",
    bankAccounts: [{ id: "EBA-4", bankName: "First Meridian Bank", branch: "Blue Area", accountTitle: "Sana Iqbal", accountNumber: "00114471667788", iban: "PK36FMER0000114471667788", currency: "USD", isPrimary: true, verifiedOn: "2021-01-13" }],
    emergencyContacts: [{ id: "EC-4", name: "Imran Iqbal", relationship: "Spouse", phone: "+92 305 9998877", isPrimary: true }],
    dependents: [{ id: "DEP-4", name: "Ahmed Iqbal", relationship: "Son", dateOfBirth: "2019-04-08", covered: true }],
    documents: [{ id: "DOC-6", title: "National identity card", category: "Identity", reference: "CNIC-6110199887766", issuedOn: "2021-01-02", expiresOn: "2031-01-01", uploadedBy: "Omar Siddiqui", restricted: true }],
  },
  {
    id: "EMP-5", employeeNumber: "EMP-000005",
    firstName: "Ayesha", lastName: "Malik", preferredName: "Ayesha", dateOfBirth: "1992-12-02", gender: "Female", maritalStatus: "Single", nationality: "Pakistani", nationalId: "3520177665544",
    workEmail: "ayesha.malik@nexora.example", personalEmail: "a.malik@example.com", mobile: "+92 311 2223311", addressLine: "45-A Model Town", city: "Lahore", country: "Pakistan",
    joinedOn: "2022-06-20", probationEndsOn: null, confirmedOn: "2022-12-20", contractEndsOn: null, noticePeriodDays: 30,
    taxIdentifier: "3520177665544", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Confirmed", createdBy: "Sana Iqbal", createdOn: "20 Jun 2022",
    bankAccounts: [{ id: "EBA-5", bankName: "Northgate Bank", branch: "Model Town", accountTitle: "Ayesha Malik", accountNumber: "00226011998877", iban: "PK29NRTG0000226011998877", currency: "USD", isPrimary: true, verifiedOn: "2022-06-24" }],
    emergencyContacts: [{ id: "EC-5", name: "Rukhsana Malik", relationship: "Mother", phone: "+92 300 4443322", isPrimary: true }],
    dependents: [],
    documents: [{ id: "DOC-7", title: "Employment contract", category: "Contract", reference: "CON-2022-0031", issuedOn: "2022-06-20", expiresOn: null, uploadedBy: "Sana Iqbal", restricted: true }],
  },
  {
    id: "EMP-6", employeeNumber: "EMP-000006",
    firstName: "Hassan", lastName: "Raza", preferredName: "Hassan", dateOfBirth: "1984-07-23", gender: "Male", maritalStatus: "Married", nationality: "Pakistani", nationalId: "4210133221100",
    workEmail: "hassan.raza@nexora.example", personalEmail: "h.raza@example.com", mobile: "+92 321 7778899", addressLine: "Flat 22, Clifton Block 5", city: "Karachi", country: "Pakistan",
    joinedOn: "2023-09-02", probationEndsOn: null, confirmedOn: "2024-03-02", contractEndsOn: null, noticePeriodDays: 60,
    taxIdentifier: "4210133221100", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Resigned", createdBy: "Sana Iqbal", createdOn: "02 Sep 2023",
    bankAccounts: [{ id: "EBA-6", bankName: "Indus Commercial", branch: "Clifton", accountTitle: "Hassan Raza", accountNumber: "00990211334455", iban: "PK36INDC0000990211334455", currency: "PKR", isPrimary: true, verifiedOn: "2023-09-05" }],
    emergencyContacts: [{ id: "EC-6", name: "Amna Raza", relationship: "Spouse", phone: "+92 333 1112200", isPrimary: true }],
    dependents: [{ id: "DEP-5", name: "Ibrahim Raza", relationship: "Son", dateOfBirth: "2016-05-30", covered: false }],
    documents: [{ id: "DOC-8", title: "Resignation acceptance", category: "Contract", reference: "RES-2026-0004", issuedOn: "2026-08-31", expiresOn: null, uploadedBy: "Sana Iqbal", restricted: true }],
  },
  {
    id: "EMP-7", employeeNumber: "EMP-000007",
    firstName: "Zainab", lastName: "Farooq", preferredName: "Zainab", dateOfBirth: "1997-03-18", gender: "Female", maritalStatus: "Single", nationality: "Pakistani", nationalId: "6110144332211",
    workEmail: "zainab.farooq@nexora.example", personalEmail: "z.farooq@example.com", mobile: "+92 336 5551122", addressLine: "House 77, Street 5, I-8/3", city: "Islamabad", country: "Pakistan",
    joinedOn: "2026-07-01", probationEndsOn: "2027-01-01", confirmedOn: null, contractEndsOn: null, noticePeriodDays: 30,
    taxIdentifier: "3520244556677", taxStatus: "Filer", taxExemptionCode: "—",
    status: "Probation", createdBy: "Sana Iqbal", createdOn: "24 Jun 2026",
    bankAccounts: [{ id: "EBA-7", bankName: "First Meridian Bank", branch: "Blue Area", accountTitle: "Zainab Farooq", accountNumber: "00114471224466", iban: "PK36FMER0000114471224466", currency: "USD", isPrimary: true, verifiedOn: "2026-07-03" }],
    emergencyContacts: [{ id: "EC-7", name: "Tariq Farooq", relationship: "Father", phone: "+92 300 6667788", isPrimary: true }],
    dependents: [],
    documents: [{ id: "DOC-9", title: "Degree certificate", category: "Qualification", reference: "NUST-2019-1182", issuedOn: "2019-09-15", expiresOn: null, uploadedBy: "Zainab Farooq", restricted: false },
      { id: "DOC-10", title: "Employment contract", category: "Contract", reference: "CON-2026-0044", issuedOn: "2026-07-01", expiresOn: null, uploadedBy: "Sana Iqbal", restricted: true }],
  },
  {
    id: "EMP-8", employeeNumber: "EMP-000008",
    firstName: "Usman", lastName: "Tariq", preferredName: "Usman", dateOfBirth: "2001-10-09", gender: "Male", maritalStatus: "Single", nationality: "Pakistani", nationalId: "3520188990011",
    workEmail: "usman.tariq@nexora.example", personalEmail: "u.tariq@example.com", mobile: "+92 345 3332211", addressLine: "House 9, Johar Town", city: "Lahore", country: "Pakistan",
    joinedOn: "2026-09-21", probationEndsOn: "2027-03-21", confirmedOn: null, contractEndsOn: "2027-09-20", noticePeriodDays: 14,
    taxIdentifier: "3520188990011", taxStatus: "Non-filer", taxExemptionCode: "TRN-EX",
    status: "Pending approval", createdBy: "Sana Iqbal", createdOn: "16 Sep 2026",
    bankAccounts: [],
    emergencyContacts: [{ id: "EC-8", name: "Nasir Tariq", relationship: "Father", phone: "+92 300 1114455", isPrimary: true }],
    dependents: [],
    documents: [{ id: "DOC-11", title: "Degree certificate", category: "Qualification", reference: "UET-2024-8841", issuedOn: "2024-08-12", expiresOn: null, uploadedBy: "Usman Tariq", restricted: false }],
  },
];

export function employee(id: string): Employee | undefined {
  return employees.find((person) => person.id === id);
}

export function employeeName(id: string | null): string {
  if (!id) return "—";
  const person = employee(id);
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

export function fullName(person: Employee): string {
  return `${person.firstName} ${person.lastName}`;
}

/* ------------------------------------------------------------------ */
/* Effective-dated assignments and status history                      */
/* ------------------------------------------------------------------ */

export const employeeAssignments: readonly EmployeeAssignment[] = [
  { id: "ASG-001", employeeId: "EMP-1", effectiveFrom: "2021-01-04", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-001", departmentId: "ORG-DP-001", designationId: "DSG-001", jobGradeId: "GRD-001", costCentreId: "CCT-001", workLocationId: "LOC-001", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-001", reportingManagerId: null, changeReason: "Initial appointment", approvedBy: "Board", approvalReference: "APR-2021-0001" },

  { id: "ASG-002", employeeId: "EMP-2", effectiveFrom: "2021-02-01", effectiveTo: "2023-06-30", companyId: "ORG-CO-001", branchId: "ORG-BR-001", departmentId: "ORG-DP-001", designationId: "DSG-003", jobGradeId: "GRD-005", costCentreId: "CCT-001", workLocationId: "LOC-001", employmentTypeId: "EMT-002", employeeCategoryId: "CAT-002", reportingManagerId: "EMP-1", changeReason: "Initial appointment", approvedBy: "Omar Siddiqui", approvalReference: "APR-2021-0004" },
  { id: "ASG-003", employeeId: "EMP-2", effectiveFrom: "2023-07-01", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-001", departmentId: "ORG-DP-001", designationId: "DSG-002", jobGradeId: "GRD-003", costCentreId: "CCT-001", workLocationId: "LOC-004", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-001", reportingManagerId: "EMP-1", changeReason: "Promotion", approvedBy: "Omar Siddiqui", approvalReference: "APR-2023-0112" },

  { id: "ASG-004", employeeId: "EMP-3", effectiveFrom: "2022-03-14", effectiveTo: "2024-12-31", companyId: "ORG-CO-001", branchId: "ORG-BR-002", departmentId: "ORG-DP-007", designationId: "DSG-007", jobGradeId: "GRD-005", costCentreId: "CCT-003", workLocationId: "LOC-002", employmentTypeId: "EMT-002", employeeCategoryId: "CAT-002", reportingManagerId: "EMP-1", changeReason: "Initial appointment", approvedBy: "Omar Siddiqui", approvalReference: "APR-2022-0031" },
  { id: "ASG-005", employeeId: "EMP-3", effectiveFrom: "2025-01-01", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-002", departmentId: "ORG-DP-007", designationId: "DSG-006", jobGradeId: "GRD-004", costCentreId: "CCT-003", workLocationId: "LOC-003", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-002", reportingManagerId: "EMP-1", changeReason: "Promotion", approvedBy: "Omar Siddiqui", approvalReference: "APR-2024-0288" },

  { id: "ASG-006", employeeId: "EMP-4", effectiveFrom: "2021-01-11", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-001", departmentId: "ORG-DP-002", designationId: "DSG-004", jobGradeId: "GRD-003", costCentreId: "CCT-002", workLocationId: "LOC-001", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-001", reportingManagerId: "EMP-1", changeReason: "Initial appointment", approvedBy: "Omar Siddiqui", approvalReference: "APR-2021-0002" },

  { id: "ASG-007", employeeId: "EMP-5", effectiveFrom: "2022-06-20", effectiveTo: "2026-05-31", companyId: "ORG-CO-001", branchId: "ORG-BR-002", departmentId: "ORG-DP-005", designationId: "DSG-008", jobGradeId: "GRD-003", costCentreId: "CCT-005", workLocationId: "LOC-002", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-001", reportingManagerId: "EMP-1", changeReason: "Initial appointment", approvedBy: "Omar Siddiqui", approvalReference: "APR-2022-0044" },
  { id: "ASG-008", employeeId: "EMP-5", effectiveFrom: "2026-06-01", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-002", departmentId: "ORG-DP-004", designationId: "DSG-008", jobGradeId: "GRD-003", costCentreId: "CCT-004", workLocationId: "LOC-002", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-001", reportingManagerId: "EMP-2", changeReason: "Transfer", approvedBy: "Mariam Ali", approvalReference: "APR-2026-0163" },

  { id: "ASG-009", employeeId: "EMP-6", effectiveFrom: "2023-09-02", effectiveTo: "2026-08-31", companyId: "ORG-CO-001", branchId: "ORG-BR-003", departmentId: "ORG-DP-006", designationId: "DSG-009", jobGradeId: "GRD-006", costCentreId: "CCT-006", workLocationId: "LOC-006", employmentTypeId: "EMT-001", employeeCategoryId: "CAT-003", reportingManagerId: "EMP-5", changeReason: "Initial appointment", approvedBy: "Omar Siddiqui", approvalReference: "APR-2023-0077" },

  { id: "ASG-010", employeeId: "EMP-7", effectiveFrom: "2026-07-01", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-001", departmentId: "ORG-DP-003", designationId: "DSG-007", jobGradeId: "GRD-005", costCentreId: "CCT-003", workLocationId: "LOC-004", employmentTypeId: "EMT-002", employeeCategoryId: "CAT-002", reportingManagerId: "EMP-3", changeReason: "Initial appointment", approvedBy: "Sana Iqbal", approvalReference: "APR-2026-0171" },

  { id: "ASG-011", employeeId: "EMP-8", effectiveFrom: "2026-09-21", effectiveTo: null, companyId: "ORG-CO-001", branchId: "ORG-BR-002", departmentId: "ORG-DP-007", designationId: "DSG-007", jobGradeId: "GRD-006", costCentreId: "CCT-003", workLocationId: "LOC-002", employmentTypeId: "EMT-005", employeeCategoryId: "CAT-004", reportingManagerId: "EMP-3", changeReason: "Initial appointment", approvedBy: "—", approvalReference: "APR-2026-0188" },
];

export const employeeStatusEvents: readonly EmployeeStatusEvent[] = [
  { id: "STE-001", employeeId: "EMP-1", effectiveFrom: "2021-01-04", fromStatus: null, toStatus: "Confirmed", reason: "Founding appointment", approvedBy: "Board", approvalReference: "APR-2021-0001" },
  { id: "STE-002", employeeId: "EMP-2", effectiveFrom: "2021-02-01", fromStatus: null, toStatus: "Probation", reason: "Appointment on six-month probation", approvedBy: "Omar Siddiqui", approvalReference: "APR-2021-0004" },
  { id: "STE-003", employeeId: "EMP-2", effectiveFrom: "2021-08-01", fromStatus: "Probation", toStatus: "Confirmed", reason: "Probation completed satisfactorily", approvedBy: "Omar Siddiqui", approvalReference: "APR-2021-0029" },
  { id: "STE-004", employeeId: "EMP-3", effectiveFrom: "2022-03-14", fromStatus: null, toStatus: "Probation", reason: "Appointment on six-month probation", approvedBy: "Omar Siddiqui", approvalReference: "APR-2022-0031" },
  { id: "STE-005", employeeId: "EMP-3", effectiveFrom: "2022-09-14", fromStatus: "Probation", toStatus: "Confirmed", reason: "Probation completed satisfactorily", approvedBy: "Omar Siddiqui", approvalReference: "APR-2022-0092" },
  { id: "STE-006", employeeId: "EMP-4", effectiveFrom: "2021-01-11", fromStatus: null, toStatus: "Probation", reason: "Appointment on six-month probation", approvedBy: "Omar Siddiqui", approvalReference: "APR-2021-0002" },
  { id: "STE-007", employeeId: "EMP-4", effectiveFrom: "2021-07-11", fromStatus: "Probation", toStatus: "Confirmed", reason: "Probation completed satisfactorily", approvedBy: "Omar Siddiqui", approvalReference: "APR-2021-0025" },
  { id: "STE-008", employeeId: "EMP-5", effectiveFrom: "2022-06-20", fromStatus: null, toStatus: "Probation", reason: "Appointment on six-month probation", approvedBy: "Omar Siddiqui", approvalReference: "APR-2022-0044" },
  { id: "STE-009", employeeId: "EMP-5", effectiveFrom: "2022-12-20", fromStatus: "Probation", toStatus: "Confirmed", reason: "Probation completed satisfactorily", approvedBy: "Omar Siddiqui", approvalReference: "APR-2022-0121" },
  { id: "STE-010", employeeId: "EMP-6", effectiveFrom: "2023-09-02", fromStatus: null, toStatus: "Probation", reason: "Appointment on six-month probation", approvedBy: "Omar Siddiqui", approvalReference: "APR-2023-0077" },
  { id: "STE-011", employeeId: "EMP-6", effectiveFrom: "2024-03-02", fromStatus: "Probation", toStatus: "Confirmed", reason: "Probation completed satisfactorily", approvedBy: "Omar Siddiqui", approvalReference: "APR-2024-0031" },
  { id: "STE-012", employeeId: "EMP-6", effectiveFrom: "2026-08-31", fromStatus: "Confirmed", toStatus: "Resigned", reason: "Resignation accepted; Karachi office closed", approvedBy: "Sana Iqbal", approvalReference: "APR-2026-0182" },
  { id: "STE-013", employeeId: "EMP-7", effectiveFrom: "2026-07-01", fromStatus: null, toStatus: "Probation", reason: "Appointment on six-month probation", approvedBy: "Sana Iqbal", approvalReference: "APR-2026-0171" },
  { id: "STE-014", employeeId: "EMP-8", effectiveFrom: "2026-09-16", fromStatus: null, toStatus: "Draft", reason: "Record created from the offer", approvedBy: "—", approvalReference: "—" },
  { id: "STE-015", employeeId: "EMP-8", effectiveFrom: "2026-09-17", fromStatus: "Draft", toStatus: "Pending approval", reason: "Submitted for HR Manager approval", approvedBy: "—", approvalReference: "APR-2026-0188" },
];

/** Prototype "today" — the date every "current" view is resolved against. */
export const HR_TODAY = "2026-09-18";

/**
 * The assignment in force on a date: the latest row that had started and had
 * not ended. This is the only place "current department" is decided; no screen
 * reads a department off the employee, because the employee does not carry one.
 */
export function assignmentOn(employeeId: string, onDate: string = HR_TODAY): EmployeeAssignment | undefined {
  return employeeAssignments
    .filter((row) => row.employeeId === employeeId)
    .filter((row) => row.effectiveFrom <= onDate && (row.effectiveTo === null || row.effectiveTo >= onDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function assignmentsFor(employeeId: string): readonly EmployeeAssignment[] {
  return employeeAssignments
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

export function statusEventsFor(employeeId: string): readonly EmployeeStatusEvent[] {
  return employeeStatusEvents
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/** What changed between one assignment and the one before it. */
export function assignmentDifferences(
  current: EmployeeAssignment,
  previous: EmployeeAssignment | undefined,
): readonly { label: string; from: string; to: string }[] {
  if (!previous) return [];
  const comparisons: readonly { label: string; read: (row: EmployeeAssignment) => string }[] = [
    { label: "Branch", read: (row) => orgUnitName(row.branchId) },
    { label: "Department", read: (row) => orgUnitName(row.departmentId) },
    { label: "Designation", read: (row) => masterRecord("designation", row.designationId)?.name ?? "—" },
    { label: "Grade", read: (row) => masterRecord("job-grade", row.jobGradeId)?.name ?? "—" },
    { label: "Cost centre", read: (row) => masterRecord("cost-centre", row.costCentreId)?.name ?? "—" },
    { label: "Work location", read: (row) => masterRecord("work-location", row.workLocationId)?.name ?? "—" },
    { label: "Employment type", read: (row) => masterRecord("employment-type", row.employmentTypeId)?.name ?? "—" },
    { label: "Category", read: (row) => masterRecord("employee-category", row.employeeCategoryId)?.name ?? "—" },
    { label: "Reporting manager", read: (row) => employeeName(row.reportingManagerId) },
  ];
  return comparisons
    .map(({ label, read }) => ({ label, from: read(previous), to: read(current) }))
    .filter((change) => change.from !== change.to);
}

/* ------------------------------------------------------------------ */
/* Master usage — why a master is deactivated rather than deleted      */
/* ------------------------------------------------------------------ */

const masterFieldByMasterId: Readonly<Record<string, keyof EmployeeAssignment>> = {
  "designation": "designationId",
  "job-grade": "jobGradeId",
  "cost-centre": "costCentreId",
  "work-location": "workLocationId",
  "employment-type": "employmentTypeId",
  "employee-category": "employeeCategoryId",
};

/**
 * How many assignment rows reference a master — including historical ones.
 * A master used only by closed history still cannot be deleted: deleting it
 * would rewrite what those records said at the time.
 */
export function masterUsageCount(masterId: string, recordId: string): number {
  const field = masterFieldByMasterId[masterId];
  if (!field) return 0;
  return employeeAssignments.filter((row) => row[field] === recordId).length;
}

export function masterIsInUse(masterId: string, recordId: string): boolean {
  return masterUsageCount(masterId, recordId) > 0;
}

/** Only an active master may be chosen for a new assignment. */
export function selectableRecords(masterId: string): readonly MasterRecord[] {
  return hrMasters.find((master) => master.id === masterId)?.records.filter((record) => record.status === "Active") ?? [];
}

/* ------------------------------------------------------------------ */
/* Masking                                                             */
/* ------------------------------------------------------------------ */

/**
 * Keeps the last four characters. A value of four characters or fewer is
 * masked completely: revealing four of five characters is not a mask.
 */
export function maskValue(value: string): string {
  const text = value.trim();
  if (text.length <= 4) return "*".repeat(text.length);
  return "*".repeat(text.length - 4) + text.slice(-4);
}

/* ------------------------------------------------------------------ */
/* Headcount                                                           */
/* ------------------------------------------------------------------ */

export function headcountByDepartment(onDate: string = HR_TODAY): readonly { departmentId: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const person of employees) {
    if (!employedStatuses.includes(person.status)) continue;
    const assignment = assignmentOn(person.id, onDate);
    if (!assignment) continue;
    counts.set(assignment.departmentId, (counts.get(assignment.departmentId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([departmentId, count]) => ({ departmentId, name: orgUnitName(departmentId), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function activeHeadcount(onDate: string = HR_TODAY): number {
  return employees.filter(
    (person) => employedStatuses.includes(person.status) && assignmentOn(person.id, onDate) !== undefined,
  ).length;
}
