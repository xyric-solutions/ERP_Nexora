import type { HrPositionsOrganization } from "@nexora/contracts";

/**
 * Layout preview only. Shown in local development when a company has no current
 * assignments, always labelled "Sample data", never sent to the API and never
 * included in a production build. Remove once demo assignments are seeded
 * through the employee workflow.
 */
export const showPositionsOrganizationSample = process.env.NODE_ENV === "development";

type Item = HrPositionsOrganization["items"][number];

const row = (
  index: number,
  employee_name: string,
  employee_number: string,
  designation: string,
  job: string,
  job_grade: string,
  department: string,
  branch: string,
  reporting_manager: string | null,
  effective_from: string,
): Item => ({
  assignment_id: `sample-assignment-${index}`,
  employee_id: `sample-employee-${index}`,
  employee_number,
  employee_name,
  employee_status: "active",
  branch_id: `sample-branch-${branch}`,
  branch,
  department_id: `sample-department-${department}`,
  department,
  job,
  designation,
  job_grade,
  reporting_manager,
  effective_from,
});

const items: Item[] = [
  row(1, "Tariq Mahmood", "EMP-0003", "Director Operations", "Executive Leadership", "G-10", "Executive Office", "Lahore Head Office", null, "2021-01-04"),
  row(2, "Bilal Ahmed", "EMP-0021", "Engineering Manager", "Engineering Management", "G-08", "Engineering", "Lahore Head Office", "Tariq Mahmood", "2022-07-01"),
  row(3, "Ahmed Hassan", "EMP-0064", "Senior Software Engineer", "Software Engineering", "G-06", "Engineering", "Lahore Head Office", "Bilal Ahmed", "2024-03-01"),
  row(4, "Usman Tariq", "EMP-0102", "Software Engineer", "Software Engineering", "G-05", "Engineering", "Lahore Head Office", "Bilal Ahmed", "2025-06-16"),
  row(5, "Hamza Iqbal", "EMP-0216", "Software Engineer", "Software Engineering", "G-05", "Engineering", "Lahore Head Office", "Bilal Ahmed", "2026-11-03"),
  row(6, "Sara Javed", "EMP-0037", "Head of Product", "Product Management", "G-09", "Product", "Lahore Head Office", "Tariq Mahmood", "2023-01-02"),
  row(7, "Hira Shah", "EMP-0142", "Product Designer", "Product Design", "G-05", "Product", "Lahore Head Office", "Sara Javed", "2025-02-10"),
  row(8, "Hassan Javed", "EMP-0045", "Head of Customer Success", "Customer Success Leadership", "G-08", "Customer Success", "Lahore Head Office", "Tariq Mahmood", "2023-04-17"),
  row(9, "Fatima Noor", "EMP-0098", "Customer Success Lead", "Customer Success", "G-06", "Customer Success", "Karachi Branch", "Hassan Javed", "2024-09-16"),
  row(10, "Imran Qureshi", "EMP-0030", "Finance Manager", "Finance Management", "G-08", "Finance", "Lahore Head Office", "Tariq Mahmood", "2022-10-03"),
  row(11, "Zainab Rauf", "EMP-0218", "Senior Accountant", "Accounting", "G-06", "Finance", "Karachi Branch", "Imran Qureshi", "2026-11-03"),
  row(12, "Kashif Mehmood", "EMP-0110", "Data Analyst", "Financial Analysis", "G-05", "Finance", "Remote · Faisalabad", "Imran Qureshi", "2025-08-01"),
  row(13, "Rabia Anwar", "EMP-0089", "Supply Chain Manager", "Supply Chain Management", "G-07", "Supply Chain", "Lahore Central Warehouse", "Tariq Mahmood", "2024-05-06"),
  row(14, "Omer Farooq", "EMP-0131", "Warehouse Supervisor", "Warehouse Operations", "G-04", "Supply Chain", "Faisalabad Warehouse", "Rabia Anwar", "2025-04-14"),
  row(15, "Nadia Khan", "EMP-0061", "Sales Manager", "Sales Management", "G-07", "Sales", "Islamabad Office", "Tariq Mahmood", "2023-11-20"),
  row(16, "Ali Raza", "EMP-0219", "Sales Officer", "Field Sales", "G-03", "Sales", "Islamabad Office", "Nadia Khan", "2026-11-03"),
  row(17, "Ayesha Siddiqui", "EMP-0075", "HR Manager", "HR Management", "G-07", "Human Resources", "Lahore Head Office", "Tariq Mahmood", "2024-01-08"),
  row(18, "Sana Malik", "EMP-0052", "HR Officer", "HR Operations", "G-05", "Human Resources", "Lahore Head Office", "Ayesha Siddiqui", "2023-08-21"),
];

const departmentNames = [...new Set(items.map((item) => item.department))];
const departments = departmentNames
  .map((department) => {
    const people = items.filter((item) => item.department === department);
    return {
      department_id: `sample-department-${department}`,
      department,
      active_people: people.length,
      job_count: new Set(people.map((item) => item.job)).size,
      manager_count: new Set(people.map((item) => item.reporting_manager).filter(Boolean)).size,
    };
  })
  .sort((a, b) => b.active_people - a.active_people || a.department.localeCompare(b.department));

export const positionsOrganizationSample: Omit<HrPositionsOrganization, "company_id" | "generated_at"> = {
  metrics: {
    current_assignments: items.length,
    active_departments: departments.length,
    represented_jobs: new Set(items.map((item) => item.job)).size,
    reporting_managers: new Set(items.map((item) => item.reporting_manager).filter(Boolean)).size,
    without_manager: items.filter((item) => !item.reporting_manager).length,
  },
  departments,
  items,
};
