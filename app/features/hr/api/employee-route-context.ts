import type { HrApiClient } from "./hr-client";

/** Resolve record deep links through the authorized API, including the employee's company. */
export async function loadEmployeeRouteCompanies(client: HrApiClient, employeeId?: string) {
  const [directory, employee] = await Promise.all([
    client.companies(),
    employeeId ? client.employee(employeeId) : Promise.resolve(null),
  ]);
  if (employee && !directory.items.some((company) => company.id === employee.company_id))
    throw new Error("Employee company is outside your current scope.");
  return { ...directory, preferredCompanyId: employee?.company_id ?? directory.items[0]?.id ?? "" };
}

/** Keep a deep-linked employee available even when outside the first directory page. */
export async function loadEmployeeRouteDirectory(client: HrApiClient, companyId: string, employeeId?: string) {
  const [directory, employee] = await Promise.all([
    client.employees({ companyId, limit: 100 }),
    employeeId ? client.employee(employeeId) : Promise.resolve(null),
  ]);
  if (!employee || employee.company_id !== companyId) return { ...directory, selectedEmployeeId: "" };
  return {
    ...directory,
    items: directory.items.some((item) => item.id === employee.id) ? directory.items : [employee, ...directory.items],
    selectedEmployeeId: employee.id,
  };
}
