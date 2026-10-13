/**
 * Fleet Management fixtures for the isolated Nexora UI/UX prototype.
 * Deterministic presentation data only; no Demo Account or API dependency.
 */
import type {
  ModuleDashboardProfile,
  ModuleDetailProfile,
  ModuleFormProfile,
  ModuleListProfile,
  ModuleProfile,
  ModuleReportProfile,
  ModuleRow,
  ModuleWorkflowProfile,
} from "./module-profile-types";

function rows(entries: readonly (readonly [string, Record<string, string>, string])[]): ModuleRow[] {
  return entries.map(([id, cells, status]) => ({ id, cells, status }));
}

const vehicleRows = rows([
  ["fl-v-1", { vehicle: "KHI-6296", asset: "FA-10214", description: "Toyota Hilux Revo 2.8", category: "Light commercial", branch: "Karachi", driver: "Omar Manzoor", odometer: "84,260 km", availability: "Available" }, "Active"],
  ["fl-v-2", { vehicle: "LHR-8421", asset: "FA-10308", description: "Isuzu NPR 71", category: "Distribution truck", branch: "Lahore", driver: "Salman Sadiq", odometer: "126,440 km", availability: "On trip" }, "Active"],
  ["fl-v-3", { vehicle: "ISB-1174", asset: "FA-10411", description: "Honda City 1.5", category: "Passenger car", branch: "Islamabad", driver: "Unassigned", odometer: "42,815 km", availability: "Available" }, "Active"],
  ["fl-v-4", { vehicle: "KHI-3802", asset: "FA-10166", description: "Hino 500 FG8J", category: "Heavy truck", branch: "Karachi", driver: "Adeel Khan", odometer: "218,905 km", availability: "Workshop" }, "Maintenance hold"],
  ["fl-v-5", { vehicle: "LHR-5510", asset: "FA-10502", description: "Suzuki Bolan", category: "Service van", branch: "Lahore", driver: "Naveed Ahmed", odometer: "67,120 km", availability: "Reserved" }, "Active"],
]);

const driverRows = rows([
  ["fl-d-1", { driver: "DRV-0042", name: "Omar Manzoor", licence: "LTV-KHI-88341", class: "LTV", expires: "18 Apr 2027", assignment: "KHI-6296", safety: "96 / 100", hours: "31.5 h" }, "Compliant"],
  ["fl-d-2", { driver: "DRV-0051", name: "Salman Sadiq", licence: "HTV-LHR-48129", class: "HTV", expires: "09 Feb 2027", assignment: "LHR-8421", safety: "91 / 100", hours: "37.0 h" }, "Compliant"],
  ["fl-d-3", { driver: "DRV-0038", name: "Adeel Khan", licence: "HTV-KHI-29418", class: "HTV", expires: "24 Sep 2026", assignment: "KHI-3802", safety: "82 / 100", hours: "28.2 h" }, "Renewal due"],
  ["fl-d-4", { driver: "DRV-0064", name: "Naveed Ahmed", licence: "LTV-LHR-19042", class: "LTV", expires: "11 Jun 2027", assignment: "LHR-5510", safety: "94 / 100", hours: "34.1 h" }, "Compliant"],
  ["fl-d-5", { driver: "DRV-0070", name: "Farhan Ali", licence: "LTV-ISB-74022", class: "LTV", expires: "03 Oct 2026", assignment: "Unassigned", safety: "88 / 100", hours: "12.0 h" }, "Review due"],
]);

const vehicleList: ModuleListProfile = {
  columns: [
    { key: "vehicle", label: "Registration / vehicle" }, { key: "asset", label: "Asset no." },
    { key: "description", label: "Make & model" }, { key: "category", label: "Category" },
    { key: "branch", label: "Branch" }, { key: "driver", label: "Current driver" },
    { key: "odometer", label: "Odometer", numeric: true }, { key: "availability", label: "Availability" },
  ],
  rows: vehicleRows, linkKey: "vehicle", openPageId: "vehicle-detail",
  createPageId: "add-vehicle", createLabel: "Add vehicle",
  filters: ["Branch: All", "Category: All", "Availability: All", "Status: Active", "Ownership: All"],
  summary: "Fleet register with asset, operational, custody and availability status.", totalRecords: 28,
};

const driverList: ModuleListProfile = {
  columns: [
    { key: "driver", label: "Driver ID" }, { key: "name", label: "Driver" },
    { key: "licence", label: "Licence no." }, { key: "class", label: "Class" },
    { key: "expires", label: "Licence expiry" }, { key: "assignment", label: "Assigned vehicle" },
    { key: "safety", label: "Safety score", numeric: true }, { key: "hours", label: "Hours this week", numeric: true },
  ],
  rows: driverRows, linkKey: "driver", openPageId: "driver-detail",
  createPageId: "add-driver", createLabel: "Add driver",
  filters: ["Branch: All", "Licence class: All", "Compliance: All", "Assignment: All"],
  summary: "Driver eligibility, assignment, working hours and safety compliance.", totalRecords: 34,
};

const assignmentList: ModuleListProfile = {
  columns: [{ key: "assignment", label: "Assignment" }, { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "purpose", label: "Purpose / cost centre" }, { key: "from", label: "From" }, { key: "to", label: "To" }, { key: "approved", label: "Approved by" }],
  rows: rows([
    ["fl-a-1", { assignment: "VAS-2026-0184", vehicle: "KHI-6296", driver: "Omar Manzoor", purpose: "Field service / CC-410", from: "01 Sep 2026", to: "30 Sep 2026", approved: "Hassan Raza" }, "Active"],
    ["fl-a-2", { assignment: "VAS-2026-0183", vehicle: "LHR-8421", driver: "Salman Sadiq", purpose: "Distribution / CC-330", from: "28 Aug 2026", to: "Open", approved: "Mariam Ali" }, "Active"],
    ["fl-a-3", { assignment: "VAS-2026-0182", vehicle: "ISB-1174", driver: "Farhan Ali", purpose: "Client visits / CC-220", from: "04 Sep 2026", to: "06 Sep 2026", approved: "Pending" }, "Pending approval"],
  ]), linkKey: "assignment", createPageId: "add-assignment", createLabel: "Add assignment",
  filters: ["Branch: All", "Vehicle: All", "Driver: All", "Date range", "Status: All"], totalRecords: 19,
};

const tripList: ModuleListProfile = {
  columns: [{ key: "trip", label: "Trip no." }, { key: "date", label: "Dispatch date" }, { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "route", label: "Route" }, { key: "distance", label: "Distance", numeric: true }, { key: "load", label: "Load / purpose" }, { key: "eta", label: "ETA" }],
  rows: rows([
    ["fl-t-1", { trip: "TRP-2026-0918", date: "15 Sep 2026", vehicle: "LHR-8421", driver: "Salman Sadiq", route: "Lahore - Faisalabad - Lahore", distance: "382 km", load: "SO-2026-1058 / 4.2 t", eta: "18:30" }, "In transit"],
    ["fl-t-2", { trip: "TRP-2026-0917", date: "15 Sep 2026", vehicle: "KHI-6296", driver: "Omar Manzoor", route: "Karachi - Hub - Karachi", distance: "116 km", load: "Service call / PRJ-014", eta: "16:10" }, "Dispatched"],
    ["fl-t-3", { trip: "TRP-2026-0916", date: "14 Sep 2026", vehicle: "LHR-5510", driver: "Naveed Ahmed", route: "Lahore city route 04", distance: "92 km", load: "8 deliveries", eta: "Completed" }, "Completed"],
    ["fl-t-4", { trip: "TRP-2026-0915", date: "14 Sep 2026", vehicle: "KHI-3802", driver: "Adeel Khan", route: "Karachi - Hyderabad", distance: "328 km", load: "PO return / 6.8 t", eta: "On hold" }, "Maintenance hold"],
  ]), linkKey: "trip", openPageId: "trip-detail", createPageId: "add-trip", createLabel: "Plan trip",
  filters: ["Branch: All", "Vehicle: All", "Driver: All", "Route: All", "Date range", "Status: All"], totalRecords: 148,
};

const fuelList: ModuleListProfile = {
  columns: [{ key: "entry", label: "Fuel entry" }, { key: "date", label: "Date" }, { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "station", label: "Station / card" }, { key: "litres", label: "Litres", numeric: true }, { key: "rate", label: "Rate", numeric: true }, { key: "amount", label: "Amount", numeric: true }, { key: "economy", label: "Economy", numeric: true }],
  rows: rows([
    ["fl-f-1", { entry: "FUE-2026-2281", date: "15 Sep 2026", vehicle: "KHI-6296", driver: "Omar Manzoor", station: "PSO Fleet / 8842", litres: "42.85", rate: "PKR 350.00", amount: "PKR 15,000", economy: "10.8 km/L" }, "Verified"],
    ["fl-f-2", { entry: "FUE-2026-2280", date: "15 Sep 2026", vehicle: "LHR-8421", driver: "Salman Sadiq", station: "Shell Card / 1029", litres: "81.20", rate: "PKR 348.50", amount: "PKR 28,298", economy: "6.4 km/L" }, "Pending odometer"],
    ["fl-f-3", { entry: "FUE-2026-2279", date: "14 Sep 2026", vehicle: "LHR-5510", driver: "Naveed Ahmed", station: "Total / Cash", litres: "28.10", rate: "PKR 349.20", amount: "PKR 9,813", economy: "9.7 km/L" }, "Exception"],
  ]), linkKey: "entry", createPageId: "add-fuel-entry", createLabel: "Add fuel entry",
  filters: ["Vehicle: All", "Driver: All", "Fuel type: All", "Station: All", "Card: All", "Date range", "Status: All"], totalRecords: 426,
};

const workOrderList: ModuleListProfile = {
  columns: [{ key: "order", label: "Work order" }, { key: "vehicle", label: "Vehicle" }, { key: "type", label: "Service type" }, { key: "workshop", label: "Workshop" }, { key: "opened", label: "Opened" }, { key: "due", label: "Target completion" }, { key: "estimate", label: "Estimate", numeric: true }, { key: "downtime", label: "Downtime", numeric: true }],
  rows: rows([
    ["fl-wo-1", { order: "FWO-2026-0318", vehicle: "KHI-3802", type: "Brake system repair", workshop: "Hino Central Workshop", opened: "14 Sep 2026", due: "16 Sep 2026", estimate: "PKR 184,500", downtime: "38 h" }, "In progress"],
    ["fl-wo-2", { order: "FWO-2026-0317", vehicle: "KHI-6296", type: "80,000 km service", workshop: "Toyota Highway Motors", opened: "17 Sep 2026", due: "17 Sep 2026", estimate: "PKR 62,000", downtime: "Planned 6 h" }, "Scheduled"],
    ["fl-wo-3", { order: "FWO-2026-0316", vehicle: "LHR-5510", type: "Battery replacement", workshop: "In-house workshop", opened: "12 Sep 2026", due: "12 Sep 2026", estimate: "PKR 28,400", downtime: "3.2 h" }, "Completed"],
  ]), linkKey: "order", openPageId: "service-work-order-detail", createPageId: "add-service-work-order", createLabel: "Create work order",
  filters: ["Branch: All", "Vehicle: All", "Workshop: All", "Service type: All", "Priority: All", "Status: All"], totalRecords: 67,
};

const maintenancePlanList: ModuleListProfile = {
  columns: [{ key: "plan", label: "Plan" }, { key: "vehicleClass", label: "Vehicle / class" }, { key: "trigger", label: "Trigger" }, { key: "last", label: "Last service" }, { key: "next", label: "Next due" }, { key: "remaining", label: "Remaining", numeric: true }, { key: "owner", label: "Owner" }],
  rows: rows([
    ["fl-mp-1", { plan: "FMP-0021", vehicleClass: "KHI-6296 / Light commercial", trigger: "10,000 km or 6 months", last: "74,410 km", next: "84,410 km", remaining: "150 km", owner: "Karachi Fleet" }, "Due soon"],
    ["fl-mp-2", { plan: "FMP-0014", vehicleClass: "LHR-8421 / Distribution truck", trigger: "15,000 km or 4 months", last: "116,100 km", next: "131,100 km", remaining: "4,660 km", owner: "Lahore Fleet" }, "On track"],
    ["fl-mp-3", { plan: "FMP-0008", vehicleClass: "KHI-3802 / Heavy truck", trigger: "12,000 km or 3 months", last: "205,880 km", next: "217,880 km", remaining: "Overdue 1,025 km", owner: "Karachi Fleet" }, "Overdue"],
  ]), linkKey: "plan", createPageId: "add-maintenance-plan", createLabel: "Add plan",
  filters: ["Branch: All", "Vehicle class: All", "Trigger: All", "Due window: 30 days", "Status: All"], totalRecords: 31,
};

const complianceList: ModuleListProfile = {
  columns: [{ key: "record", label: "Compliance record" }, { key: "vehicle", label: "Vehicle" }, { key: "document", label: "Document type" }, { key: "provider", label: "Authority / provider" }, { key: "expires", label: "Expiry" }, { key: "days", label: "Days remaining", numeric: true }, { key: "owner", label: "Owner" }],
  rows: rows([
    ["fl-c-1", { record: "CMP-2026-882", vehicle: "KHI-6296", document: "Comprehensive insurance", provider: "EFU General", expires: "28 Oct 2026", days: "43", owner: "Ayesha Malik" }, "Valid"],
    ["fl-c-2", { record: "CMP-2026-874", vehicle: "KHI-3802", document: "Route permit", provider: "Sindh Transport", expires: "24 Sep 2026", days: "9", owner: "Ayesha Malik" }, "Renewal due"],
    ["fl-c-3", { record: "CMP-2026-860", vehicle: "LHR-8421", document: "Fitness certificate", provider: "Punjab Transport", expires: "19 Sep 2026", days: "4", owner: "Bilal Khan" }, "Urgent"],
    ["fl-c-4", { record: "CMP-2026-842", vehicle: "ISB-1174", document: "Token tax", provider: "ICT Excise", expires: "30 Jun 2027", days: "288", owner: "Ayesha Malik" }, "Valid"],
  ]), linkKey: "record", filters: ["Branch: All", "Vehicle: All", "Document: All", "Expiry window: 60 days", "Status: All"], totalRecords: 94,
};

const incidentList: ModuleListProfile = {
  columns: [{ key: "incident", label: "Incident" }, { key: "date", label: "Date / time" }, { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "type", label: "Type" }, { key: "severity", label: "Severity" }, { key: "claim", label: "Claim / liability" }],
  rows: rows([
    ["fl-i-1", { incident: "FIN-2026-0048", date: "12 Sep 2026 18:42", vehicle: "LHR-5510", driver: "Naveed Ahmed", type: "Minor collision", severity: "Low", claim: "CLM-2026-0018 / under review" }, "Investigation"],
    ["fl-i-2", { incident: "FIN-2026-0047", date: "04 Sep 2026 11:15", vehicle: "KHI-3802", driver: "Adeel Khan", type: "Roadside breakdown", severity: "Medium", claim: "No claim / company cost" }, "Closed"],
    ["fl-i-3", { incident: "FIN-2026-0046", date: "29 Aug 2026 09:20", vehicle: "KHI-6296", driver: "Omar Manzoor", type: "Traffic violation", severity: "Low", claim: "Fine PKR 2,000 / driver" }, "Action due"],
  ]), linkKey: "incident", openPageId: "incident-claim-detail", createPageId: "add-incident", createLabel: "Report incident",
  filters: ["Branch: All", "Vehicle: All", "Driver: All", "Type: All", "Severity: All", "Date range", "Status: All"], totalRecords: 18,
};

const fleetDashboard: ModuleDashboardProfile = {
  kpis: [
    { id: "fl-k-active", label: "Active fleet", value: "28 vehicles", delta: "24 available", comparison: "2 trips, 2 workshop", tone: "positive", trend: [26, 26, 27, 27, 28, 28] },
    { id: "fl-k-util", label: "Fleet utilisation", value: "78.4%", delta: "+4.2 pts", comparison: "vs prior month", tone: "positive", trend: [68, 71, 70, 74, 76, 78] },
    { id: "fl-k-cost", label: "Cost per kilometre", value: "PKR 92.40", delta: "+6.1%", comparison: "fuel and maintenance", tone: "warning", trend: [84, 86, 85, 88, 90, 92] },
    { id: "fl-k-fuel", label: "Fuel efficiency", value: "8.7 km/L", delta: "-0.4 km/L", comparison: "vs target", tone: "warning", trend: [9.4, 9.2, 9.3, 9.1, 8.9, 8.7] },
    { id: "fl-k-service", label: "Maintenance due", value: "6", delta: "2 overdue", comparison: "next 30 days", tone: "danger", trend: [3, 4, 4, 5, 5, 6] },
    { id: "fl-k-compliance", label: "Compliance rate", value: "96.8%", delta: "3 renewals", comparison: "inside 30 days", tone: "neutral", trend: [94, 95, 97, 97, 96, 97] },
  ],
  charts: [
    {
      kind: "combo", eyebrow: "Operating trend", title: "Distance and cost", subtitle: "Monthly kilometres against total fleet operating cost.", unit: "number",
      labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"], barLabel: "Distance (km)", barValues: [68420, 72180, 74840, 79210, 81420, 84680],
      lineLabel: "Cost index", lineValues: [78, 81, 80, 84, 88, 92],
      accessibleSummary: "Distance rises from 68,420 to 84,680 kilometres while the cost index rises from 78 to 92, indicating cost pressure is growing faster than activity.",
      note: "Fuel price and heavy-truck repair costs explain most of the August increase.",
    },
    {
      kind: "stacked", eyebrow: "Availability", title: "Fleet state by branch", subtitle: "Available, assigned and unavailable vehicles.", unit: "number",
      labels: ["Karachi", "Lahore", "Islamabad"], series: [
        { label: "Available", tone: "teal", values: [8, 6, 4] }, { label: "On trip", tone: "blue", values: [2, 3, 1] }, { label: "Workshop / hold", tone: "sky", values: [2, 1, 1] },
      ], accessibleSummary: "Karachi has 12 vehicles, Lahore 10 and Islamabad 6; four vehicles are unavailable or on hold.",
    },
    {
      kind: "donut", eyebrow: "Cost composition", title: "Fleet spend mix", subtitle: "Current-period operating cost by category.", unit: "percent",
      segments: [
        { id: "fl-sp-fuel", label: "Fuel", value: 48, tone: "blue" }, { id: "fl-sp-maint", label: "Maintenance", value: 27, tone: "sky" },
        { id: "fl-sp-driver", label: "Driver & allowance", value: 15, tone: "teal" }, { id: "fl-sp-road", label: "Insurance & road costs", value: 10, tone: "violet" },
      ], centerValue: "PKR 7.82M", centerLabel: "August cost", accessibleSummary: "Fuel is 48 percent of fleet spend, maintenance 27 percent, driver costs 15 percent and insurance and road costs 10 percent.",
    },
    {
      kind: "gauges", eyebrow: "Control health", title: "Fleet policy compliance", subtitle: "Attainment against approved operating thresholds.", gauges: [
        { id: "fl-g-util", label: "Utilisation", valueLabel: "78.4%", percent: 98, hint: "98% of 80% target", tone: "teal" },
        { id: "fl-g-pm", label: "Preventive service", valueLabel: "91.2%", percent: 96, hint: "96% of 95% target", tone: "sky" },
        { id: "fl-g-doc", label: "Documents valid", valueLabel: "96.8%", percent: 97, hint: "3 renewals due", tone: "blue" },
        { id: "fl-g-safe", label: "Driver safety", valueLabel: "90.2", percent: 95, hint: "95% of 95 target", tone: "teal" },
      ],
    },
  ],
  attentionTitle: "Fleet exceptions requiring action",
  attention: [
    { id: "fl-att-1", title: "Hino 500 service overdue by 1,025 km", detail: "Vehicle KHI-3802 is blocked from dispatch until workshop release.", status: "Critical", tone: "danger" },
    { id: "fl-att-2", title: "Fitness certificate expires in four days", detail: "LHR-8421 renewal evidence has not been uploaded.", status: "Urgent", tone: "danger" },
    { id: "fl-att-3", title: "Fuel economy outside tolerance", detail: "LHR-5510 is 14% below its rolling class benchmark.", status: "Review", tone: "warning" },
    { id: "fl-att-4", title: "Driver licence renewal pending", detail: "Adeel Khan HTV licence expires on 24 September.", status: "Due", tone: "warning" },
  ],
};

const maintenanceDashboard: ModuleDashboardProfile = {
  kpis: [
    { id: "fl-m-open", label: "Open work orders", value: "9", delta: "3 high priority", comparison: "2 waiting parts", tone: "warning" },
    { id: "fl-m-overdue", label: "Overdue services", value: "2", delta: "+1", comparison: "vs last week", tone: "danger" },
    { id: "fl-m-down", label: "Downtime", value: "124 h", delta: "-8.4%", comparison: "month to date", tone: "positive" },
    { id: "fl-m-pm", label: "Preventive ratio", value: "72%", delta: "+5 pts", comparison: "vs prior month", tone: "positive" },
  ],
  charts: [
    { kind: "stacked", eyebrow: "Workload", title: "Maintenance orders by state", subtitle: "Six-month preventive and corrective workload.", unit: "number", labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"], series: [{ label: "Preventive", tone: "teal", values: [14, 16, 15, 18, 19, 21] }, { label: "Corrective", tone: "sky", values: [8, 7, 9, 6, 8, 8] }], accessibleSummary: "Preventive maintenance rises to 21 orders while corrective work remains at eight orders in August." },
    { kind: "donut", eyebrow: "Root causes", title: "Downtime composition", subtitle: "Workshop hours by primary cause.", unit: "percent", segments: [{ id: "fl-dt-parts", label: "Waiting parts", value: 38, tone: "sky" }, { id: "fl-dt-repair", label: "Repair", value: 34, tone: "blue" }, { id: "fl-dt-approve", label: "Approval", value: 18, tone: "violet" }, { id: "fl-dt-inspect", label: "Inspection", value: 10, tone: "teal" }], centerValue: "124 h", centerLabel: "Downtime", accessibleSummary: "Waiting for parts creates 38 percent of downtime, repairs 34 percent, approvals 18 percent and inspection 10 percent." },
    { kind: "gauges", eyebrow: "Performance", title: "Workshop service levels", subtitle: "Maintenance control targets.", gauges: [{ id: "fl-sla-plan", label: "Plan compliance", valueLabel: "91.2%", percent: 96, hint: "Target 95%", tone: "sky" }, { id: "fl-sla-first", label: "First-time fix", valueLabel: "87.0%", percent: 97, hint: "Target 90%", tone: "teal" }, { id: "fl-sla-part", label: "Parts available", valueLabel: "82.0%", percent: 91, hint: "Target 90%", tone: "sky" }] },
  ],
  attention: [
    { id: "fl-m-att-1", title: "FWO-2026-0318 exceeds approval estimate", detail: "Brake repair estimate increased by PKR 42,500 after inspection.", status: "Approve", tone: "warning" },
    { id: "fl-m-att-2", title: "Two work orders waiting for parts", detail: "Critical brake and suspension items require procurement follow-up.", status: "Blocked", tone: "danger" },
  ],
};

function fleetForm(
  title: string,
  reference: string,
  subjectLabel: string,
  subjectValue: string,
  specific: ModuleFormProfile["sections"][number]["fields"],
): ModuleFormProfile {
  return {
    sections: [
      {
        title: title + " identity",
        fields: [
          { label: title + " number", value: reference },
          { label: subjectLabel, value: subjectValue, type: "select", options: [subjectValue, "KHI-6296 - Toyota Hilux", "LHR-8421 - Isuzu NPR"] },
          { label: "Company / branch", value: "Nexora Demo Company / Karachi", type: "select", options: ["Nexora Demo Company / Karachi", "Nexora Demo Company / Lahore", "Nexora Demo Company / Islamabad"] },
          ...specific,
        ],
      },
      {
        title: "Operational and cost allocation",
        fields: [
          { label: "Cost centre", value: "CC-410 - Field Operations", type: "select", options: ["CC-410 - Field Operations", "CC-330 - Distribution", "CC-220 - Commercial"] },
          { label: "Project / route / purpose", value: "Operational fleet requirement" },
          { label: "Responsible person", value: "Ayesha Malik", type: "select", options: ["Ayesha Malik", "Bilal Khan", "Hassan Raza"] },
          { label: "Supporting reference", value: "REQ-2026-0184" },
          { label: "Estimated cost", value: "PKR 42,500" },
          { label: "Expense account", value: "510401 - Vehicle operating cost", type: "select", options: ["510401 - Vehicle operating cost", "510402 - Fuel expense", "510403 - Maintenance expense"] },
        ],
      },
      {
        title: "Controls, evidence and notes",
        fields: [
          { label: "Approval route", value: "Fleet Manager > Finance Manager", type: "select", options: ["Fleet Manager > Finance Manager", "Fleet Manager only", "Operations Director > CFO"] },
          { label: "Policy check", value: "Run automatically on submit" },
          { label: "Attachment checklist", value: "Registration, receipt, inspection or supporting evidence as applicable.", type: "textarea", wide: true },
          { label: "Internal notes", value: "Prototype record for workflow and form review only.", type: "textarea", wide: true },
        ],
      },
    ],
  };
}

function fleetWorkflow(
  steps: readonly string[],
  currentIndex: number,
  currentTitle: string,
  fields: readonly (readonly [string, string])[],
  exceptions: readonly { id: string; title: string; detail: string }[],
): ModuleWorkflowProfile {
  return {
    steps: steps.map((label, index) => ({ label, state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending" })),
    currentTitle, currentFields: fields, exceptions,
  };
}

const reportRows = rows([
  ["fl-r-1", { vehicle: "KHI-6296", category: "Light commercial", distance: "3,842 km", fuel: "PKR 126,400", maintenance: "PKR 62,000", road: "PKR 18,500", total: "PKR 206,900", unitCost: "PKR 53.85/km" }, "On target"],
  ["fl-r-2", { vehicle: "LHR-8421", category: "Distribution truck", distance: "5,104 km", fuel: "PKR 294,800", maintenance: "PKR 88,200", road: "PKR 36,000", total: "PKR 419,000", unitCost: "PKR 82.09/km" }, "Watch"],
  ["fl-r-3", { vehicle: "KHI-3802", category: "Heavy truck", distance: "2,880 km", fuel: "PKR 246,400", maintenance: "PKR 184,500", road: "PKR 44,600", total: "PKR 475,500", unitCost: "PKR 165.10/km" }, "Exception"],
  ["fl-r-4", { vehicle: "LHR-5510", category: "Service van", distance: "2,240 km", fuel: "PKR 98,120", maintenance: "PKR 28,400", road: "PKR 12,800", total: "PKR 139,320", unitCost: "PKR 62.20/km" }, "Review"],
]);

function fleetReport(title: string, note: string): ModuleReportProfile {
  return {
    kpis: [
      { id: title + "-cost", label: "Total fleet cost", value: "PKR 7.82M", delta: "+5.8%", comparison: "vs prior month", tone: "warning" },
      { id: title + "-distance", label: "Distance travelled", value: "84,680 km", delta: "+4.0%", comparison: "vs prior month", tone: "positive" },
      { id: title + "-unit", label: "Average cost / km", value: "PKR 92.40", delta: "+1.7%", comparison: "activity adjusted", tone: "warning" },
      { id: title + "-exceptions", label: "Exceptions", value: "6", delta: "2 critical", comparison: "require action", tone: "danger" },
    ],
    charts: [
      { kind: "combo", eyebrow: "Trend", title, subtitle: note, unit: "number", labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"], barLabel: "Distance (km)", barValues: [68420, 72180, 74840, 79210, 81420, 84680], lineLabel: "Cost index", lineValues: [78, 81, 80, 84, 88, 92], accessibleSummary: "Distance and operating cost both rise through August, with costs growing faster than activity." },
      { kind: "donut", eyebrow: "Composition", title: "Cost by category", subtitle: "Trace every value to its source transaction.", unit: "percent", segments: [{ id: title + "-fuel", label: "Fuel", value: 48, tone: "blue" }, { id: title + "-maint", label: "Maintenance", value: 27, tone: "sky" }, { id: title + "-driver", label: "Driver", value: 15, tone: "teal" }, { id: title + "-other", label: "Other", value: 10, tone: "violet" }], centerValue: "PKR 7.82M", centerLabel: "Total", accessibleSummary: "Fuel is the largest cost category at 48 percent." },
      { kind: "gauges", eyebrow: "Performance", title: "Fleet benchmarks", subtitle: "Vehicle performance against policy thresholds.", gauges: [{ id: title + "-util", label: "Utilisation", valueLabel: "78.4%", percent: 98, hint: "Target 80%", tone: "teal" }, { id: title + "-fuel-g", label: "Fuel efficiency", valueLabel: "8.7 km/L", percent: 92, hint: "Target 9.5", tone: "sky" }, { id: title + "-comp", label: "Compliance", valueLabel: "96.8%", percent: 97, hint: "Target 100%", tone: "sky" }] },
    ],
    columns: [{ key: "vehicle", label: "Vehicle" }, { key: "category", label: "Category" }, { key: "distance", label: "Distance", numeric: true }, { key: "fuel", label: "Fuel", numeric: true }, { key: "maintenance", label: "Maintenance", numeric: true }, { key: "road", label: "Road costs", numeric: true }, { key: "total", label: "Total", numeric: true }, { key: "unitCost", label: "Cost / km", numeric: true }],
    rows: reportRows,
  };
}

const vehicleDetail: ModuleDetailProfile = {
  fields: [
    ["Registration", "KHI-6296"], ["Fleet / asset no.", "FLT-0028 / FA-10214"], ["Make and model", "Toyota Hilux Revo 2.8"],
    ["Chassis / engine", "MR0HA3CDX6001842 / 1GD-FTV"], ["Ownership", "Company owned"], ["Branch / custodian", "Karachi / Field Operations"],
    ["Current driver", "DRV-0042 - Omar Manzoor"], ["Odometer", "84,260 km"], ["Availability", "Available"], ["Next service", "84,410 km / 150 km remaining"],
    ["Insurance expiry", "28 Oct 2026"], ["Book value", "PKR 8,420,000"],
  ],
  lineColumns: [{ key: "date", label: "Date" }, { key: "event", label: "Activity" }, { key: "reference", label: "Source reference" }, { key: "odometer", label: "Odometer", numeric: true }, { key: "cost", label: "Cost", numeric: true }],
  lines: rows([
    ["fl-vd-1", { date: "15 Sep 2026", event: "Fuel issue - 42.85 litres", reference: "FUE-2026-2281", odometer: "84,260 km", cost: "PKR 15,000" }, "Verified"],
    ["fl-vd-2", { date: "12 Sep 2026", event: "Field service trip", reference: "TRP-2026-0908", odometer: "84,116 km", cost: "PKR 4,800" }, "Completed"],
    ["fl-vd-3", { date: "18 Mar 2026", event: "Scheduled maintenance", reference: "FWO-2026-0204", odometer: "74,410 km", cost: "PKR 58,600" }, "Completed"],
  ]),
};

const driverDetail: ModuleDetailProfile = {
  fields: [
    ["Driver ID", "DRV-0042"], ["Employee", "EMP-0184 - Omar Manzoor"], ["Branch", "Karachi"], ["Licence no.", "LTV-KHI-88341"],
    ["Licence class", "LTV"], ["Expiry", "18 Apr 2027"], ["Assigned vehicle", "KHI-6296"], ["Safety score", "96 / 100"],
    ["Hours this week", "31.5 hours"], ["Training status", "Defensive driving current"], ["Open incidents", "0"], ["Mobile", "+92 300 555 0184"],
  ],
  lineColumns: [{ key: "date", label: "Date" }, { key: "activity", label: "Driver activity" }, { key: "reference", label: "Reference" }, { key: "distance", label: "Distance", numeric: true }, { key: "score", label: "Result" }],
  lines: rows([
    ["fl-dd-1", { date: "15 Sep 2026", activity: "Karachi - Hub service trip", reference: "TRP-2026-0917", distance: "116 km", score: "On time" }, "In progress"],
    ["fl-dd-2", { date: "09 Sep 2026", activity: "Defensive driving assessment", reference: "TRN-2026-0088", distance: "-", score: "96%" }, "Passed"],
    ["fl-dd-3", { date: "04 Sep 2026", activity: "Traffic violation review", reference: "FIN-2026-0046", distance: "-", score: "Driver liable" }, "Action due"],
  ]),
};

const tripDetail: ModuleDetailProfile = {
  fields: [
    ["Trip no.", "TRP-2026-0918"], ["Status", "In transit"], ["Vehicle", "LHR-8421 - Isuzu NPR 71"], ["Driver", "DRV-0051 - Salman Sadiq"],
    ["Route", "Lahore - Faisalabad - Lahore"], ["Customer / source", "SO-2026-1058 - Atlas Retail"], ["Planned distance", "382 km"], ["GPS distance", "196 km current"],
    ["Dispatch", "15 Sep 2026 08:15"], ["ETA", "15 Sep 2026 18:30"], ["Load", "4.2 tonnes / 18 packages"], ["Cost centre", "CC-330 - Distribution"],
  ],
  lineColumns: [{ key: "time", label: "Time" }, { key: "milestone", label: "Route milestone" }, { key: "location", label: "Location" }, { key: "distance", label: "Distance", numeric: true }, { key: "evidence", label: "Evidence" }],
  lines: rows([
    ["fl-td-1", { time: "08:15", milestone: "Gate-out", location: "Lahore DC", distance: "0 km", evidence: "Gate pass GP-1842" }, "Complete"],
    ["fl-td-2", { time: "11:48", milestone: "Customer delivery", location: "Faisalabad", distance: "188 km", evidence: "POD captured" }, "Complete"],
    ["fl-td-3", { time: "12:15", milestone: "Return leg", location: "Faisalabad", distance: "196 km", evidence: "GPS active" }, "Current"],
  ]),
};

const serviceDetail: ModuleDetailProfile = {
  fields: [
    ["Work order", "FWO-2026-0318"], ["Vehicle", "KHI-3802 - Hino 500 FG8J"], ["Priority", "High"], ["Service type", "Corrective - brake system"],
    ["Workshop", "Hino Central Workshop"], ["Opened", "14 Sep 2026 09:30"], ["Target completion", "16 Sep 2026 16:00"], ["Odometer", "218,905 km"],
    ["Original estimate", "PKR 142,000"], ["Revised estimate", "PKR 184,500"], ["Approval variance", "PKR 42,500 / 29.9%"], ["Downtime", "38 hours"],
  ],
  lineColumns: [{ key: "item", label: "Part / labour" }, { key: "source", label: "Source" }, { key: "quantity", label: "Quantity", numeric: true }, { key: "rate", label: "Rate", numeric: true }, { key: "amount", label: "Amount", numeric: true }],
  lines: rows([
    ["fl-sd-1", { item: "Brake pad set", source: "Inventory / SP-4418", quantity: "1", rate: "PKR 68,000", amount: "PKR 68,000" }, "Reserved"],
    ["fl-sd-2", { item: "Brake rotor machining", source: "Workshop service", quantity: "2", rate: "PKR 22,500", amount: "PKR 45,000" }, "Approved"],
    ["fl-sd-3", { item: "Technician labour", source: "Hino Central", quantity: "18 h", rate: "PKR 3,250", amount: "PKR 58,500" }, "In progress"],
  ]),
};

const incidentDetail: ModuleDetailProfile = {
  fields: [
    ["Incident", "FIN-2026-0048"], ["Occurred", "12 Sep 2026 18:42"], ["Vehicle", "LHR-5510 - Suzuki Bolan"], ["Driver", "DRV-0064 - Naveed Ahmed"],
    ["Location", "Gulberg III, Lahore"], ["Severity", "Low"], ["Police report", "DDR-LHR-8821"], ["Third party", "Punjab Traders van"],
    ["Claim", "CLM-2026-0018"], ["Estimated exposure", "PKR 86,000"], ["Liability", "Under investigation"], ["Vehicle status", "Released after inspection"],
  ],
  lineColumns: [{ key: "time", label: "Time" }, { key: "event", label: "Investigation / claim event" }, { key: "owner", label: "Owner" }, { key: "evidence", label: "Evidence" }, { key: "impact", label: "Financial impact", numeric: true }],
  lines: rows([
    ["fl-id-1", { time: "12 Sep 18:50", event: "Driver reported incident", owner: "Naveed Ahmed", evidence: "6 photos / statement", impact: "Pending" }, "Complete"],
    ["fl-id-2", { time: "13 Sep 09:10", event: "Fleet inspection completed", owner: "Ayesha Malik", evidence: "Inspection FL-I-228", impact: "PKR 86,000 estimate" }, "Complete"],
    ["fl-id-3", { time: "14 Sep 14:30", event: "Claim lodged with insurer", owner: "Finance Insurance Desk", evidence: "Claim acknowledgement", impact: "Excess PKR 25,000" }, "In progress"],
  ]),
};

/* FLEET_DATA */

export const fleetProfile: ModuleProfile = {
  moduleId: "fleet",
  pages: {
    "fleet-overview": { dashboard: fleetDashboard },
    "fleet-calendar": { dashboard: fleetDashboard },
    "maintenance-dashboard": { dashboard: maintenanceDashboard },
    "vehicles": { list: vehicleList },
    "drivers": { list: driverList },
    "vehicle-assignments": { list: assignmentList },
    "trips": { list: tripList },
    "fuel-register": { list: fuelList },
    "fuel-card-management": {
      list: {
        columns: [{ key: "card", label: "Card" }, { key: "vehicle", label: "Assigned vehicle" }, { key: "provider", label: "Provider" }, { key: "limit", label: "Monthly limit", numeric: true }, { key: "spent", label: "Month spend", numeric: true }, { key: "remaining", label: "Remaining", numeric: true }, { key: "last", label: "Last used" }],
        rows: rows([
          ["fl-card-1", { card: "PSO-8842", vehicle: "KHI-6296", provider: "PSO Fleet", limit: "PKR 180,000", spent: "PKR 126,400", remaining: "PKR 53,600", last: "15 Sep 2026" }, "Active"],
          ["fl-card-2", { card: "SHL-1029", vehicle: "LHR-8421", provider: "Shell Fleet", limit: "PKR 360,000", spent: "PKR 294,800", remaining: "PKR 65,200", last: "15 Sep 2026" }, "Active"],
          ["fl-card-3", { card: "TOTAL-4108", vehicle: "Unassigned", provider: "Total Card", limit: "PKR 75,000", spent: "PKR 4,200", remaining: "PKR 70,800", last: "03 Sep 2026" }, "Blocked"],
        ]),
        linkKey: "card", filters: ["Provider: All", "Vehicle: All", "Utilisation: All", "Status: All"], totalRecords: 26,
      },
    },
    "maintenance-plans": { list: maintenancePlanList },
    "service-work-orders": { list: workOrderList },
    "registration-insurance": { list: complianceList },
    "driver-licence-compliance": { list: driverList },
    "accidents-incidents": { list: incidentList },
    "claims": { list: incidentList },
    "tolls-fines": {
      list: {
        columns: [{ key: "reference", label: "Reference" }, { key: "date", label: "Date" }, { key: "vehicle", label: "Vehicle" }, { key: "driver", label: "Driver" }, { key: "type", label: "Cost type" }, { key: "authority", label: "Authority / route" }, { key: "amount", label: "Amount", numeric: true }, { key: "liability", label: "Liability" }],
        rows: rows([
          ["fl-road-1", { reference: "RDC-2026-0914", date: "14 Sep 2026", vehicle: "LHR-8421", driver: "Salman Sadiq", type: "Motorway toll", authority: "M3 / M-Tag", amount: "PKR 3,450", liability: "Company" }, "Posted"],
          ["fl-road-2", { reference: "RDC-2026-0904", date: "04 Sep 2026", vehicle: "KHI-6296", driver: "Omar Manzoor", type: "Traffic fine", authority: "Karachi Traffic Police", amount: "PKR 2,000", liability: "Driver" }, "Recovery due"],
          ["fl-road-3", { reference: "RDC-2026-0898", date: "29 Aug 2026", vehicle: "ISB-1174", driver: "Farhan Ali", type: "Parking", authority: "Islamabad client site", amount: "PKR 800", liability: "Company" }, "Approved"],
        ]), linkKey: "reference", createPageId: "add-road-cost", createLabel: "Add road cost", filters: ["Type: All", "Vehicle: All", "Driver: All", "Liability: All", "Date range", "Status: All"], totalRecords: 82,
      },
    },
    "tyres-batteries": {
      list: {
        columns: [{ key: "component", label: "Component ID" }, { key: "type", label: "Type / brand" }, { key: "vehicle", label: "Installed on" }, { key: "installed", label: "Installed" }, { key: "reading", label: "Usage", numeric: true }, { key: "remaining", label: "Life remaining", numeric: true }, { key: "warranty", label: "Warranty" }],
        rows: rows([
          ["fl-comp-1", { component: "TYR-2026-0188", type: "Bridgestone R156 / Front LH", vehicle: "LHR-8421", installed: "18 Feb 2026", reading: "31,840 km", remaining: "48%", warranty: "Valid" }, "Active"],
          ["fl-comp-2", { component: "BAT-2025-0094", type: "AGS HB-100R", vehicle: "KHI-3802", installed: "22 Oct 2025", reading: "11 months", remaining: "22%", warranty: "Expires 22 Oct" }, "Replace soon"],
          ["fl-comp-3", { component: "TYR-2025-0142", type: "General Euro / Rear RH", vehicle: "KHI-6296", installed: "06 Dec 2025", reading: "42,180 km", remaining: "18%", warranty: "Expired" }, "Inspection due"],
        ]), linkKey: "component", filters: ["Component: All", "Vehicle: All", "Position: All", "Life remaining", "Warranty: All", "Status: All"], totalRecords: 164,
      },
    },
    "spare-parts-usage": {
      list: {
        columns: [{ key: "issue", label: "Issue reference" }, { key: "date", label: "Date" }, { key: "workOrder", label: "Work order" }, { key: "vehicle", label: "Vehicle" }, { key: "part", label: "Inventory part" }, { key: "quantity", label: "Quantity", numeric: true }, { key: "cost", label: "Cost", numeric: true }],
        rows: rows([
          ["fl-part-1", { issue: "STI-2026-1448", date: "15 Sep 2026", workOrder: "FWO-2026-0318", vehicle: "KHI-3802", part: "SP-4418 - Brake pad set", quantity: "1 set", cost: "PKR 68,000" }, "Reserved"],
          ["fl-part-2", { issue: "STI-2026-1431", date: "12 Sep 2026", workOrder: "FWO-2026-0316", vehicle: "LHR-5510", part: "BAT-100R - AGS battery", quantity: "1", cost: "PKR 28,400" }, "Issued"],
          ["fl-part-3", { issue: "STI-2026-1414", date: "08 Sep 2026", workOrder: "FWO-2026-0312", vehicle: "KHI-6296", part: "FLT-2814 - Oil filter", quantity: "2", cost: "PKR 12,800" }, "Issued"],
        ]), linkKey: "issue", filters: ["Warehouse: All", "Vehicle: All", "Work order: All", "Part category: All", "Date range"], totalRecords: 119,
      },
    },
    "add-vehicle": { form: fleetForm("Vehicle", "Auto-generated on save", "Registration number", "KHI-NEW", [
      { label: "Make / model", value: "Toyota Hilux Revo 2.8" }, { label: "Model year", value: "2026" }, { label: "Vehicle category", value: "Light commercial", type: "select", options: ["Light commercial", "Distribution truck", "Passenger car", "Heavy truck"] },
      { label: "Chassis number", value: "Required and unique" }, { label: "Engine number", value: "Required and unique" }, { label: "Acquisition date", value: "2026-09-15", type: "date" },
    ]) },
    "add-driver": { form: fleetForm("Driver", "Auto-generated on save", "Employee / contractor", "EMP-0184 - Omar Manzoor", [
      { label: "Licence number", value: "LTV-KHI-88341" }, { label: "Licence class", value: "LTV", type: "select", options: ["LTV", "HTV", "PSV"] }, { label: "Licence expiry", value: "2027-04-18", type: "date" },
      { label: "Safety score", value: "96 / 100" }, { label: "Emergency contact", value: "+92 300 555 0199" },
    ]) },
    "add-assignment": { form: fleetForm("Vehicle assignment", "VAS-AUTO-2026", "Vehicle", "ISB-1174 - Honda City", [
      { label: "Driver", value: "DRV-0070 - Farhan Ali", type: "select", options: ["DRV-0070 - Farhan Ali", "DRV-0042 - Omar Manzoor"] }, { label: "Assignment from", value: "2026-09-15", type: "date" }, { label: "Assignment to", value: "2026-09-30", type: "date" },
      { label: "Purpose", value: "Client visits and site inspections" }, { label: "Opening odometer", value: "42,815 km" },
    ]) },
    "add-trip": { form: fleetForm("Trip", "TRP-AUTO-2026", "Vehicle", "LHR-8421 - Isuzu NPR", [
      { label: "Driver", value: "DRV-0051 - Salman Sadiq", type: "select", options: ["DRV-0051 - Salman Sadiq", "DRV-0042 - Omar Manzoor"] },
      { label: "Dispatch date", value: "2026-09-15", type: "date" }, { label: "Origin", value: "Lahore Distribution Centre" }, { label: "Destination / route", value: "Faisalabad - customer route" },
      { label: "Source document", value: "SO-2026-1058" }, { label: "Planned distance", value: "382 km" },
    ]) },
    "add-fuel-entry": { form: fleetForm("Fuel entry", "FUE-AUTO-2026", "Vehicle", "KHI-6296 - Toyota Hilux", [
      { label: "Driver", value: "DRV-0042 - Omar Manzoor", type: "select", options: ["DRV-0042 - Omar Manzoor", "DRV-0051 - Salman Sadiq"] },
      { label: "Transaction date", value: "2026-09-15", type: "date" }, { label: "Current odometer reading (total km)", value: "84,260 km" }, { label: "Fuel type", value: "High-speed diesel", type: "select", options: ["High-speed diesel", "Petrol", "CNG"] },
      { label: "Fuel quantity", value: "42.85 litres" }, { label: "Rate per litre", value: "PKR 350.00" }, { label: "Fuel amount (auto-calculated)", value: "PKR 15,000.00" },
    ]) },
    "add-road-cost": { form: fleetForm("Road cost", "RDC-AUTO-2026", "Vehicle", "LHR-8421 - Isuzu NPR", [
      { label: "Cost type", value: "Motorway toll", type: "select", options: ["Motorway toll", "Traffic fine", "Parking", "Route permit fee"] }, { label: "Transaction date", value: "2026-09-15", type: "date" },
      { label: "Driver / liable party", value: "DRV-0051 - Salman Sadiq" }, { label: "Authority / route", value: "M3 / M-Tag" }, { label: "Amount", value: "PKR 3,450" },
    ]) },
    "add-maintenance-plan": { form: fleetForm("Maintenance plan", "FMP-AUTO-2026", "Vehicle / category", "KHI-6296 - Light commercial", [
      { label: "Service template", value: "10,000 km scheduled service", type: "select", options: ["10,000 km scheduled service", "15,000 km heavy-vehicle service", "Annual inspection"] },
      { label: "Distance interval", value: "10,000 km" }, { label: "Time interval", value: "6 months" }, { label: "Tolerance", value: "250 km / 7 days" },
      { label: "Next due odometer reading", value: "84,410 km" }, { label: "Preferred workshop", value: "Toyota Highway Motors" },
      { label: "Standard labour rate", value: "PKR 3,250 per hour" }, { label: "Estimated service amount", value: "PKR 62,000.00" },
    ]) },
    "add-service-work-order": { form: fleetForm("Service work order", "FWO-AUTO-2026", "Vehicle", "KHI-3802 - Hino 500", [
      { label: "Service type", value: "Corrective repair", type: "select", options: ["Preventive service", "Corrective repair", "Inspection", "Tyre / battery"] },
      { label: "Priority", value: "High", type: "select", options: ["Normal", "High", "Critical"] }, { label: "Current odometer reading (total km)", value: "218,905 km" },
      { label: "Workshop", value: "Hino Central Workshop" }, { label: "Target completion", value: "2026-09-16", type: "date" },
      { label: "Labour quantity", value: "18 hours" }, { label: "Labour rate per hour", value: "PKR 3,250.00" }, { label: "Labour amount", value: "PKR 58,500.00" },
      { label: "Parts amount", value: "PKR 126,000.00" }, { label: "Estimated total amount", value: "PKR 184,500.00" },
      { label: "Initial diagnosis", value: "Brake vibration and reduced braking efficiency.", type: "textarea", wide: true },
    ]) },
    "add-incident": { form: fleetForm("Fleet incident", "FIN-AUTO-2026", "Vehicle", "LHR-5510 - Suzuki Bolan", [
      { label: "Driver", value: "DRV-0064 - Naveed Ahmed" }, { label: "Occurred on", value: "2026-09-15", type: "date" },
      { label: "Incident type", value: "Road accident", type: "select", options: ["Road accident", "Breakdown", "Theft", "Traffic violation", "Cargo damage"] },
      { label: "Severity", value: "Low", type: "select", options: ["Low", "Medium", "High", "Critical"] }, { label: "Location", value: "Gulberg III, Lahore" },
      { label: "Immediate response", value: "Driver safe; vehicle secured; supervisor and insurer notified.", type: "textarea", wide: true },
    ]) },
    "vehicle-detail": { detail: vehicleDetail },
    "driver-detail": { detail: driverDetail },
    "trip-detail": { detail: tripDetail },
    "service-work-order-detail": { detail: serviceDetail },
    "incident-claim-detail": { detail: incidentDetail },
    "dispatch-board": { workflow: fleetWorkflow(
      ["Requested", "Eligibility check", "Vehicle assigned", "Dispatched", "Delivery / task", "Trip closed"],
      3, "Dispatch vehicle and driver",
      [["Trip", "TRP-2026-0918"], ["Vehicle", "LHR-8421 - available and compliant"], ["Driver", "Salman Sadiq - eligible"], ["Source", "SO-2026-1058"], ["Gate readiness", "Load and documents confirmed"]],
      [{ id: "fl-w-d1", title: "Route congestion warning", detail: "M3 travel time is 38 minutes above plan; revised ETA requires confirmation." }],
    ) },
    "route-planning": { workflow: fleetWorkflow(
      ["Demand consolidated", "Capacity matched", "Routes optimised", "Dispatcher review", "Release"],
      2, "Review recommended route plan",
      [["Planning date", "15 Sep 2026"], ["Orders / stops", "18 orders / 24 stops"], ["Vehicles proposed", "6"], ["Distance reduction", "8.4%"], ["Capacity utilisation", "87%"]],
      [{ id: "fl-w-r1", title: "Heavy vehicle route restriction", detail: "KHI-3802 cannot enter the selected city zone before 22:00." }, { id: "fl-w-r2", title: "One delivery exceeds shift hours", detail: "Reassign stop 18 or approve driver overtime." }],
    ) },
    "fuel-reconciliation": { workflow: fleetWorkflow(
      ["Statement imported", "Card matched", "Odometer validated", "Exceptions reviewed", "Approved", "Posted"],
      3, "Resolve fuel exceptions",
      [["Statement", "PSO-FLEET-SEP-01"], ["Lines", "68"], ["Matched", "64 / 94.1%"], ["Unmatched value", "PKR 42,180"], ["Duplicate risk", "1 transaction"]],
      [{ id: "fl-w-f1", title: "Missing odometer reading", detail: "FUE-2026-2280 cannot calculate consumption." }, { id: "fl-w-f2", title: "Economy outside tolerance", detail: "LHR-5510 is 14% below the vehicle-class benchmark." }],
    ) },
    "inspection-schedule": { workflow: fleetWorkflow(
      ["Due population", "Appointments planned", "Vehicle presented", "Inspection performed", "Defects resolved", "Released"],
      2, "Present vehicles for inspection",
      [["Inspection week", "14-20 Sep 2026"], ["Vehicles due", "7"], ["Appointments confirmed", "6"], ["Overdue", "1 - KHI-3802"], ["Owner", "Fleet Compliance"]],
      [{ id: "fl-w-i1", title: "KHI-3802 inspection overdue", detail: "Dispatch remains blocked until brake repair and roadworthiness sign-off." }],
    ) },
    "renewal-calendar": { workflow: fleetWorkflow(
      ["Renewals identified", "Documents prepared", "Fees approved", "Submitted", "Evidence verified", "Closed"],
      2, "Approve renewal package",
      [["Due in 30 days", "6 documents"], ["Urgent", "2"], ["Fees requested", "PKR 184,200"], ["Missing evidence", "1 fitness certificate"], ["Owner", "Ayesha Malik"]],
      [{ id: "fl-w-c1", title: "Fitness certificate expires in four days", detail: "LHR-8421 inspection appointment is not confirmed." }, { id: "fl-w-c2", title: "Route permit fee requires approval", detail: "KHI-3802 renewal value exceeds the Fleet Manager limit." }],
    ) },
    "vehicle-costing": { report: fleetReport("Vehicle whole-life cost", "Acquisition, fuel, maintenance, road costs and depreciation by vehicle.") },
    "utilisation-downtime": { report: fleetReport("Utilisation and downtime", "Productive availability, idle time and workshop hours by vehicle and branch.") },
    "fuel-efficiency": { report: fleetReport("Fuel efficiency", "Consumption, economy, price and exception analysis by vehicle, driver and route.") },
    "maintenance-cost-analysis": { report: fleetReport("Maintenance cost analysis", "Preventive and corrective costs, downtime and workshop performance.") },
    "fleet-reports": { report: fleetReport("Fleet management reporting", "Consolidated operational, compliance and financial fleet performance.") },
  },
};
