export type AiIntent =
  | "price-variance"
  | "sales-margin"
  | "cash-liquidity"
  | "receivables"
  | "inventory"
  | "production"
  | "projects"
  | "people"
  | "fleet"
  | "tax"
  | "company-overview";

export interface AiReportMetric {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "warning";
}

export interface AiReportFinding {
  title: string;
  detail: string;
  value: string;
}

export interface AiReportChartRow {
  label: string;
  actual: number;
  benchmark: number;
  display: string;
}

export interface AiReportSource {
  label: string;
  reference: string;
  moduleId: string;
  pageId: string;
}

export interface AiAnalysisResult {
  id: string;
  question: string;
  intent: AiIntent;
  title: string;
  subtitle: string;
  period: string;
  confidence: number;
  executiveSummary: string;
  metrics: AiReportMetric[];
  findings: AiReportFinding[];
  chartTitle: string;
  chartRows: AiReportChartRow[];
  columns: string[];
  rows: string[][];
  sources: AiReportSource[];
  actions: string[];
  assumptions: string[];
}

interface QueryContext {
  roleLabel: string;
  moduleLabel: string;
  pageLabel: string;
}

const priceLines = [
  { product: "Servo Drive SD-400", supplier: "Mektron Industrial", quantity: 120, unit: "unit", standard: 16250, actual: 17400, reference: "PO-2026-01842" },
  { product: "Mild Steel Sheet 3mm", supplier: "Karachi Steelworks", quantity: 3200, unit: "kg", standard: 315, actual: 334, reference: "PO-2026-01837" },
  { product: "Control Cable 4-Core", supplier: "Allied Cables", quantity: 2500, unit: "metre", standard: 540, actual: 518, reference: "PO-2026-01821" },
  { product: "Export Packaging Carton", supplier: "PackPro Pakistan", quantity: 5000, unit: "unit", standard: 84, actual: 91, reference: "PO-2026-01815" },
  { product: "Industrial Lubricant LX", supplier: "Petrochem Trading", quantity: 400, unit: "litre", standard: 2950, actual: 2880, reference: "PO-2026-01796" },
];

const salesUnits = [
  { name: "Industrial Automation", revenue: 18600000, target: 17400000, margin: 32.8, priorMargin: 34.1 },
  { name: "Professional Services", revenue: 12400000, target: 13900000, margin: 24.6, priorMargin: 28.2 },
  { name: "Trading", revenue: 9800000, target: 10200000, margin: 18.7, priorMargin: 19.4 },
  { name: "After-sales Support", revenue: 6100000, target: 5700000, margin: 41.2, priorMargin: 39.8 },
];

const bankPositions = [
  { bank: "HBL Operating - PKR", ledger: 18420000, available: 16680000, unreconciled: 724000 },
  { bank: "Meezan Collections - PKR", ledger: 8750000, available: 8750000, unreconciled: 0 },
  { bank: "Standard Chartered - USD", ledger: 11240000, available: 10680000, unreconciled: 284000 },
];

const receivables = [
  { customer: "Atlas Retail Group", current: 1200000, overdue: 3400000, days: 78, risk: "High" },
  { customer: "Crescent Engineering", current: 2800000, overdue: 1900000, days: 46, risk: "Medium" },
  { customer: "Nova Healthcare", current: 1650000, overdue: 840000, days: 35, risk: "Low" },
  { customer: "Metro Distribution", current: 900000, overdue: 1270000, days: 61, risk: "High" },
];

const inventory = [
  { item: "Servo Drive SD-400", onHand: 420, required: 600, value: 7308000, age: 22, status: "Shortage" },
  { item: "Control Cable 4-Core", onHand: 8200, required: 5600, value: 4247600, age: 47, status: "Healthy" },
  { item: "Legacy Controller LC-8", onHand: 96, required: 12, value: 2880000, age: 286, status: "Slow moving" },
  { item: "Export Packaging Carton", onHand: 1480, required: 2100, value: 134680, age: 18, status: "Reorder" },
];

const production = [
  { order: "MO-2026-00418", product: "Control Panel CP-90", planned: 100, output: 94, materialVariance: 7.4, scrap: 3.1, efficiency: 88 },
  { order: "MO-2026-00416", product: "Drive Cabinet DC-20", planned: 60, output: 60, materialVariance: -1.8, scrap: 0.8, efficiency: 96 },
  { order: "MO-2026-00412", product: "Automation Kit AK-5", planned: 240, output: 226, materialVariance: 3.6, scrap: 2.2, efficiency: 91 },
];

const projects = [
  { project: "Atlas ERP Rollout", revenue: 12800000, cost: 9960000, margin: 22.2, utilisation: 71, unbilled: 1840000 },
  { project: "Nova Plant Automation", revenue: 19400000, cost: 13700000, margin: 29.4, utilisation: 83, unbilled: 920000 },
  { project: "Crescent Support Retainer", revenue: 7200000, cost: 4210000, margin: 41.5, utilisation: 68, unbilled: 1260000 },
];

const people = [
  { department: "Finance", headcount: 18, attendance: 96.4, overtime: 42, payroll: 3420000 },
  { department: "Sales", headcount: 34, attendance: 93.1, overtime: 88, payroll: 6840000 },
  { department: "Production", headcount: 86, attendance: 91.8, overtime: 624, payroll: 10920000 },
  { department: "Projects", headcount: 52, attendance: 94.7, overtime: 216, payroll: 9360000 },
];

const fleet = [
  { vehicle: "LEA-24-1842", category: "Delivery truck", kilometres: 84260, fuelRate: 38.2, maintenance: 286000, due: "18 Sep 2026" },
  { vehicle: "BPL-23-771", category: "Service van", kilometres: 61840, fuelRate: 21.6, maintenance: 94000, due: "04 Oct 2026" },
  { vehicle: "ALA-25-921", category: "Executive car", kilometres: 22940, fuelRate: 13.4, maintenance: 42000, due: "22 Nov 2026" },
];

const taxItems = [
  { area: "Output GST", calculated: 4860000, ledger: 4860000, variance: 0, status: "Reconciled" },
  { area: "Input GST", calculated: 2910000, ledger: 2845000, variance: 65000, status: "Review" },
  { area: "Withholding tax", calculated: 1180000, ledger: 1162000, variance: 18000, status: "Review" },
  { area: "E-invoice readiness", calculated: 428, ledger: 421, variance: 7, status: "Exceptions" },
];

function pkr(value: number) {
  const abs = Math.abs(value);
  const formatted = abs >= 1000000 ? `PKR ${(abs / 1000000).toFixed(2)}M` : `PKR ${Math.round(abs).toLocaleString("en-US")}`;
  return value < 0 ? `-${formatted}` : formatted;
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function periodFrom(question: string) {
  if (/last\s+(week|7 days)/i.test(question)) return "Last 7 days to 16 Sep 2026";
  if (/last\s+month|august/i.test(question)) return "August 2026";
  if (/quarter|q3/i.test(question)) return "Q3 2026 to date";
  if (/year|annual|ytd/i.test(question)) return "FY 2026 year to date";
  return "September 2026 to date";
}

function detectIntent(question: string): AiIntent {
  const q = question.toLowerCase();
  if (/price|purchase rate|cost variance|supplier variance|ppv/.test(q)) return "price-variance";
  if (/sale|revenue|gross profit|gross margin|discount|pipeline|conversion/.test(q)) return "sales-margin";
  if (/cash|bank|liquidity|balance|reconcil/.test(q)) return "cash-liquidity";
  if (/receiv|customer payment|overdue|collection|debtor|aging|ageing/.test(q)) return "receivables";
  if (/inventory|stock|warehouse|slow.?moving|dead stock|reorder/.test(q)) return "inventory";
  if (/production|manufactur|bom|scrap|capacity|material consumption|work order/.test(q)) return "production";
  if (/project|utili[sz]ation|billable|unbilled|wip|revenue leakage/.test(q)) return "projects";
  if (/employee|headcount|attendance|leave|payroll|turnover|human resource|\bhr\b/.test(q)) return "people";
  if (/fleet|vehicle|fuel|odometer|maintenance|kilomet/.test(q)) return "fleet";
  if (/tax|gst|withholding|fbr|e.?invoice/.test(q)) return "tax";
  return "company-overview";
}

function idFor(intent: AiIntent, question: string) {
  let hash = 0;
  for (const char of question) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `NXAI-${intent.slice(0, 3).toUpperCase()}-${String(hash % 100000).padStart(5, "0")}`;
}

function analysePriceVariance(question: string, period: string): Omit<AiAnalysisResult, "id" | "question" | "intent"> {
  const normalized = question.toLowerCase();
  const named = priceLines.filter((line) => normalized.includes(line.product.toLowerCase()) || normalized.includes(line.supplier.toLowerCase()));
  const lines = named.length ? named : priceLines;
  const calculated = lines.map((line) => ({ ...line, variance: (line.actual - line.standard) * line.quantity, rateVariance: ((line.actual - line.standard) / line.standard) * 100 }));
  const totalVariance = calculated.reduce((sum, line) => sum + line.variance, 0);
  const actualSpend = calculated.reduce((sum, line) => sum + line.actual * line.quantity, 0);
  const adverse = calculated.filter((line) => line.variance > 0).sort((a, b) => b.variance - a.variance);
  const favourable = calculated.filter((line) => line.variance < 0).sort((a, b) => a.variance - b.variance);
  const top = adverse[0] ?? favourable[0];
  return {
    title: "Purchase price variance analysis",
    subtitle: named.length ? `Filtered to ${top.product} / ${top.supplier}` : "All purchased materials and suppliers",
    period,
    confidence: 96,
    executiveSummary: `${calculated.length} purchase lines produced a net ${totalVariance >= 0 ? "adverse" : "favourable"} price variance of ${pkr(Math.abs(totalVariance))}. ${top.product} is the largest driver at ${pkr(Math.abs(top.variance))} ${top.variance >= 0 ? "adverse" : "favourable"}.`,
    metrics: [
      { label: "Actual spend", value: pkr(actualSpend), detail: `${calculated.length} analysed lines`, tone: "neutral" },
      { label: "Net price variance", value: pkr(Math.abs(totalVariance)), detail: totalVariance >= 0 ? "Adverse to standard" : "Favourable to standard", tone: totalVariance >= 0 ? "negative" : "positive" },
      { label: "Adverse lines", value: String(adverse.length), detail: `${calculated.length - adverse.length} favourable`, tone: adverse.length > favourable.length ? "warning" : "neutral" },
      { label: "Largest movement", value: percent(top.rateVariance), detail: top.product, tone: top.rateVariance > 0 ? "negative" : "positive" },
    ],
    findings: [
      { title: "Largest adverse driver", detail: `${top.supplier} / ${top.reference}`, value: `${pkr(Math.abs(top.variance))} (${percent(top.rateVariance)})` },
      { title: "Favourable offset", detail: favourable[0] ? `${favourable[0].product} purchased below standard` : "No favourable offset in selection", value: favourable[0] ? pkr(Math.abs(favourable[0].variance)) : "None" },
      { title: "Recommended focus", detail: adverse.length ? `Review quotation and previous price for ${adverse[0].supplier}` : "Maintain negotiated pricing", value: adverse.length ? "Procurement review" : "Monitor" },
    ],
    chartTitle: "Actual rate versus standard rate",
    chartRows: calculated.map((line) => ({ label: line.product, actual: line.actual, benchmark: line.standard, display: percent(line.rateVariance) })),
    columns: ["Product", "Supplier", "Quantity", "Standard rate", "Actual rate", "Price variance"],
    rows: calculated.map((line) => [line.product, line.supplier, `${line.quantity.toLocaleString("en-US")} ${line.unit}`, pkr(line.standard), pkr(line.actual), `${pkr(Math.abs(line.variance))} ${line.variance >= 0 ? "A" : "F"}`]),
    sources: [
      { label: "Purchase orders", reference: `${calculated.length} order lines`, moduleId: "purchases", pageId: "purchase-orders" },
      { label: "Item standard costs", reference: "Approved cost version Sep-26", moduleId: "costing", pageId: "item-cost-history" },
      { label: "Supplier price history", reference: "Previous 12 months", moduleId: "purchases", pageId: "bid-comparison" },
    ],
    actions: ["Open largest variance", "Compare supplier quotations", "Prepare price review task", "Export variance report"],
    assumptions: ["Standard rate is the approved September 2026 item cost", "Quantities use the purchase-order unit of measure", "Taxes and landed costs are excluded from price variance"],
  };
}

function analyseSales(period: string): Omit<AiAnalysisResult, "id" | "question" | "intent"> {
  const revenue = salesUnits.reduce((sum, x) => sum + x.revenue, 0);
  const target = salesUnits.reduce((sum, x) => sum + x.target, 0);
  const weightedMargin = salesUnits.reduce((sum, x) => sum + x.revenue * x.margin, 0) / revenue;
  const lowest = [...salesUnits].sort((a, b) => a.margin - b.margin)[0];
  return { title: "Sales, revenue and margin analysis", subtitle: "Performance by business unit", period, confidence: 94, executiveSummary: `Revenue is ${pkr(revenue)} and ${revenue >= target ? "above" : "below"} target by ${pkr(Math.abs(revenue - target))}. Weighted gross margin is ${weightedMargin.toFixed(1)}%; ${lowest.name} has the lowest margin at ${lowest.margin.toFixed(1)}%.`, metrics: [
    { label: "Revenue", value: pkr(revenue), detail: `${percent(((revenue-target)/target)*100)} vs target`, tone: revenue >= target ? "positive" : "negative" },
    { label: "Gross margin", value: `${weightedMargin.toFixed(1)}%`, detail: "Revenue weighted", tone: "neutral" },
    { label: "Above target units", value: String(salesUnits.filter(x=>x.revenue>=x.target).length), detail: `of ${salesUnits.length} units`, tone: "neutral" },
    { label: "Lowest margin", value: `${lowest.margin}%`, detail: lowest.name, tone: "warning" },
  ], findings: salesUnits.slice().sort((a,b)=>(b.revenue-b.target)-(a.revenue-a.target)).slice(0,3).map(x=>({title:x.name,detail:`Revenue ${pkr(x.revenue)} vs target ${pkr(x.target)}`,value:`Margin ${x.margin}%`})), chartTitle:"Revenue versus target", chartRows:salesUnits.map(x=>({label:x.name,actual:x.revenue,benchmark:x.target,display:percent(((x.revenue-x.target)/x.target)*100)})), columns:["Business unit","Revenue","Target","Variance","Margin","Prior margin"], rows:salesUnits.map(x=>[x.name,pkr(x.revenue),pkr(x.target),pkr(x.revenue-x.target),`${x.margin}%`,`${x.priorMargin}%`]), sources:[{label:"Sales invoices",reference:"September posted and approved",moduleId:"sales",pageId:"invoices"},{label:"Approved targets",reference:"FY26 commercial plan",moduleId:"budget",pageId:"budget-actual"},{label:"Profitability ledger",reference:"Revenue and direct cost",moduleId:"reports",pageId:"profitability-by-business-unit"}], actions:["Open margin bridge","Review discounted orders","Prepare recovery plan","Export sales report"], assumptions:["Revenue excludes sales tax","Margin uses posted revenue and direct cost","Targets use approved FY26 commercial plan"] };
}

function analyseCash(period: string): Omit<AiAnalysisResult, "id" | "question" | "intent"> {
  const ledger=bankPositions.reduce((s,x)=>s+x.ledger,0), available=bankPositions.reduce((s,x)=>s+x.available,0), unreconciled=bankPositions.reduce((s,x)=>s+x.unreconciled,0);
  return {title:"Cash position and liquidity analysis",subtitle:"Bank balances, availability and reconciliation",period,confidence:97,executiveSummary:`Ledger cash is ${pkr(ledger)} and available cash is ${pkr(available)}. The ${pkr(ledger-available)} difference is primarily uncleared value and controls; ${pkr(unreconciled)} remains unreconciled.`,metrics:[{label:"Ledger balance",value:pkr(ledger),detail:"All bank accounts",tone:"neutral"},{label:"Available balance",value:pkr(available),detail:`${pkr(ledger-available)} below ledger`,tone:"warning"},{label:"Unreconciled",value:pkr(unreconciled),detail:"Requires matching",tone:"negative"},{label:"Liquidity coverage",value:"1.42x",detail:"Next 30 days",tone:"positive"}],findings:bankPositions.map(x=>({title:x.bank,detail:`Available ${pkr(x.available)}`,value:x.unreconciled?`${pkr(x.unreconciled)} unmatched`:"Reconciled"})),chartTitle:"Available versus ledger balance",chartRows:bankPositions.map(x=>({label:x.bank,actual:x.available,benchmark:x.ledger,display:pkr(x.ledger-x.available)})),columns:["Bank account","Ledger balance","Available balance","Difference","Unreconciled"],rows:bankPositions.map(x=>[x.bank,pkr(x.ledger),pkr(x.available),pkr(x.ledger-x.available),pkr(x.unreconciled)]),sources:[{label:"Bank account balances",reference:"As of 16 Sep 2026",moduleId:"banking",pageId:"account-balances"},{label:"Reconciliation queue",reference:"4 open movements",moduleId:"banking",pageId:"bank-reconciliation"}],actions:["Open bank activity","Match unreconciled items","Run 13-week forecast","Export treasury report"],assumptions:["USD balance translated at the prototype closing rate","Available balance reflects illustrative bank controls","No live bank feed is queried"]};
}

function analyseReceivables(period: string): Omit<AiAnalysisResult, "id" | "question" | "intent"> {
  const overdue=receivables.reduce((s,x)=>s+x.overdue,0), current=receivables.reduce((s,x)=>s+x.current,0), riskiest=[...receivables].sort((a,b)=>b.overdue-a.overdue)[0];
  return {title:"Receivables and collection risk",subtitle:"Customer exposure and predicted payment behaviour",period,confidence:92,executiveSummary:`Open receivables are ${pkr(overdue+current)}, including ${pkr(overdue)} overdue. ${riskiest.customer} is the largest collection risk at ${pkr(riskiest.overdue)} overdue and ${riskiest.days} days.`,metrics:[{label:"Open receivables",value:pkr(overdue+current),detail:"Current plus overdue",tone:"neutral"},{label:"Overdue",value:pkr(overdue),detail:`${((overdue/(overdue+current))*100).toFixed(1)}% of exposure`,tone:"negative"},{label:"High-risk customers",value:String(receivables.filter(x=>x.risk==="High").length),detail:"Prioritised collection",tone:"warning"},{label:"Predicted DSO",value:"54 days",detail:"6 days above target",tone:"negative"}],findings:receivables.slice().sort((a,b)=>b.overdue-a.overdue).slice(0,3).map(x=>({title:x.customer,detail:`${x.days} days / ${x.risk} risk`,value:pkr(x.overdue)})),chartTitle:"Overdue versus current receivables",chartRows:receivables.map(x=>({label:x.customer,actual:x.overdue,benchmark:x.current,display:`${x.days} days`})),columns:["Customer","Current","Overdue","Oldest item","Risk","Suggested action"],rows:receivables.map(x=>[x.customer,pkr(x.current),pkr(x.overdue),`${x.days} days`,x.risk,x.risk==="High"?"Contact today":"Monitor"]),sources:[{label:"Customer open items",reference:"AR subledger",moduleId:"customers",pageId:"open-items"},{label:"Receipt history",reference:"Previous 12 months",moduleId:"customers",pageId:"customer-receipts"},{label:"Credit controls",reference:"Approved limits",moduleId:"customers",pageId:"credit-limit-review"}],actions:["Open collection workbench","Prepare customer reminders","Review credit exposure","Export ageing report"],assumptions:["Predictions use prototype payment history","Disputed invoices remain in exposure","No customer communication is sent automatically"]};
}

function simpleOperationalReport(intent: Exclude<AiIntent,"price-variance"|"sales-margin"|"cash-liquidity"|"receivables"|"company-overview">, period: string): Omit<AiAnalysisResult,"id"|"question"|"intent"> {
  if(intent==="inventory") { const value=inventory.reduce((s,x)=>s+x.value,0), slow=inventory.filter(x=>/Slow/.test(x.status)); return {title:"Inventory health and valuation",subtitle:"Availability, ageing and reorder risk",period,confidence:95,executiveSummary:`Stock value is ${pkr(value)}. ${inventory.filter(x=>x.status!=="Healthy").length} of ${inventory.length} highlighted items require action; ${slow[0].item} is the largest ageing risk.`,metrics:[{label:"Stock value",value:pkr(value),detail:"Selected critical items",tone:"neutral"},{label:"Shortage items",value:String(inventory.filter(x=>x.status==="Shortage").length),detail:"Production impact",tone:"negative"},{label:"Reorder alerts",value:String(inventory.filter(x=>x.status==="Reorder").length),detail:"Below requirement",tone:"warning"},{label:"Slow-moving value",value:pkr(slow.reduce((s,x)=>s+x.value,0)),detail:"> 180 days",tone:"warning"}],findings:inventory.map(x=>({title:x.item,detail:`${x.onHand.toLocaleString()} on hand / ${x.age} days`,value:x.status})).slice(0,3),chartTitle:"On hand versus required quantity",chartRows:inventory.map(x=>({label:x.item,actual:x.onHand,benchmark:x.required,display:x.status})),columns:["Item","On hand","Required","Value","Age","Status"],rows:inventory.map(x=>[x.item,x.onHand.toLocaleString(),x.required.toLocaleString(),pkr(x.value),`${x.age} days`,x.status]),sources:[{label:"Stock ledger",reference:"All warehouses",moduleId:"inventory",pageId:"stock-ledger"},{label:"Material requirements",reference:"Released demand",moduleId:"manufacturing",pageId:"material-requirements"}],actions:["Open shortage list","Prepare replenishment","Review slow-moving stock","Export inventory report"],assumptions:["Available quantity excludes reservations","Age is measured from last movement","Values use current prototype valuation"]}; }
  if(intent==="production") { const output=production.reduce((s,x)=>s+x.output,0), planned=production.reduce((s,x)=>s+x.planned,0), worst=[...production].sort((a,b)=>b.materialVariance-a.materialVariance)[0]; return {title:"Production performance and BOM variance",subtitle:"Output, material use, scrap and efficiency",period,confidence:94,executiveSummary:`Output is ${output} units against ${planned} planned (${((output/planned)*100).toFixed(1)}%). ${worst.order} has the largest material variance at ${percent(worst.materialVariance)} and requires tolerance review.`,metrics:[{label:"Output attainment",value:`${((output/planned)*100).toFixed(1)}%`,detail:`${output} of ${planned} units`,tone:"warning"},{label:"Largest BOM variance",value:percent(worst.materialVariance),detail:worst.order,tone:"negative"},{label:"Average efficiency",value:`${(production.reduce((s,x)=>s+x.efficiency,0)/production.length).toFixed(1)}%`,detail:"Across selected orders",tone:"neutral"},{label:"Average scrap",value:`${(production.reduce((s,x)=>s+x.scrap,0)/production.length).toFixed(1)}%`,detail:"Actual output basis",tone:"warning"}],findings:production.map(x=>({title:x.order,detail:`${x.product} / ${x.output} of ${x.planned}`,value:`BOM ${percent(x.materialVariance)}`})),chartTitle:"Actual output versus planned output",chartRows:production.map(x=>({label:x.order,actual:x.output,benchmark:x.planned,display:`${x.efficiency}% efficient`})),columns:["MO","Product","Planned","Output","Material variance","Scrap","Efficiency"],rows:production.map(x=>[x.order,x.product,String(x.planned),String(x.output),percent(x.materialVariance),`${x.scrap}%`,`${x.efficiency}%`]),sources:[{label:"Manufacturing orders",reference:"Released and completed",moduleId:"manufacturing",pageId:"production-orders"},{label:"Approved BOM",reference:"Active cost version",moduleId:"manufacturing",pageId:"boms"}],actions:["Open variance order","Review BOM tolerance","Prepare corrective action","Export production report"],assumptions:["Variance compares actual issue with approved BOM","Scrap uses completed output","Open orders use current recorded quantities"]}; }
  if(intent==="projects") { const revenue=projects.reduce((s,x)=>s+x.revenue,0), cost=projects.reduce((s,x)=>s+x.cost,0), risk=[...projects].sort((a,b)=>a.margin-b.margin)[0]; return {title:"Project profitability and utilisation",subtitle:"Revenue, cost, WIP and leakage",period,confidence:93,executiveSummary:`Selected projects generated ${pkr(revenue)} revenue and ${pkr(revenue-cost)} gross contribution. ${risk.project} has the lowest margin at ${risk.margin}% and ${pkr(risk.unbilled)} unbilled value.`,metrics:[{label:"Project revenue",value:pkr(revenue),detail:`${projects.length} active projects`,tone:"neutral"},{label:"Gross contribution",value:pkr(revenue-cost),detail:`${(((revenue-cost)/revenue)*100).toFixed(1)}% margin`,tone:"positive"},{label:"Unbilled revenue",value:pkr(projects.reduce((s,x)=>s+x.unbilled,0)),detail:"Billing review",tone:"warning"},{label:"Average utilisation",value:`${(projects.reduce((s,x)=>s+x.utilisation,0)/projects.length).toFixed(1)}%`,detail:"Delivery resources",tone:"neutral"}],findings:projects.map(x=>({title:x.project,detail:`Utilisation ${x.utilisation}% / unbilled ${pkr(x.unbilled)}`,value:`Margin ${x.margin}%`})),chartTitle:"Revenue versus project cost",chartRows:projects.map(x=>({label:x.project,actual:x.revenue,benchmark:x.cost,display:`${x.margin}% margin`})),columns:["Project","Revenue","Cost","Margin","Utilisation","Unbilled"],rows:projects.map(x=>[x.project,pkr(x.revenue),pkr(x.cost),`${x.margin}%`,`${x.utilisation}%`,pkr(x.unbilled)]),sources:[{label:"Project ledger",reference:"Cost and revenue",moduleId:"projects",pageId:"project-profitability"},{label:"Timesheets",reference:"Approved hours",moduleId:"projects",pageId:"time-expense-review"}],actions:["Open low-margin project","Review unbilled work","Prepare billing action","Export project report"],assumptions:["Margin excludes corporate overhead","Only approved time is included","Unbilled value uses contractual rates"]}; }
  if(intent==="people") { const headcount=people.reduce((s,x)=>s+x.headcount,0), payroll=people.reduce((s,x)=>s+x.payroll,0), lowest=[...people].sort((a,b)=>a.attendance-b.attendance)[0]; return {title:"Workforce, attendance and payroll analysis",subtitle:"People capacity and employee-cost indicators",period,confidence:91,executiveSummary:`Headcount is ${headcount} with payroll cost of ${pkr(payroll)}. ${lowest.department} has the lowest attendance at ${lowest.attendance}% and the highest operational overtime concentration.`,metrics:[{label:"Headcount",value:String(headcount),detail:"Selected departments",tone:"neutral"},{label:"Payroll cost",value:pkr(payroll),detail:"Current month",tone:"neutral"},{label:"Average attendance",value:`${(people.reduce((s,x)=>s+x.attendance*x.headcount,0)/headcount).toFixed(1)}%`,detail:"Headcount weighted",tone:"warning"},{label:"Overtime hours",value:people.reduce((s,x)=>s+x.overtime,0).toLocaleString(),detail:"Review against plan",tone:"warning"}],findings:people.map(x=>({title:x.department,detail:`${x.headcount} employees / ${x.overtime} overtime hours`,value:`${x.attendance}% attendance`})).slice(0,3),chartTitle:"Attendance versus 95% standard",chartRows:people.map(x=>({label:x.department,actual:x.attendance,benchmark:95,display:`${x.headcount} people`})),columns:["Department","Headcount","Attendance","Overtime hours","Payroll cost"],rows:people.map(x=>[x.department,String(x.headcount),`${x.attendance}%`,String(x.overtime),pkr(x.payroll)]),sources:[{label:"Employee master",reference:"Active employees",moduleId:"hr",pageId:"employees"},{label:"Attendance",reference:"September records",moduleId:"hr",pageId:"attendance"},{label:"Payroll validation",reference:"Draft payroll",moduleId:"hr",pageId:"payroll-validation"}],actions:["Open attendance exceptions","Review overtime","Prepare workforce brief","Export HR report"],assumptions:["Payroll values are pre-posting prototype values","Attendance excludes approved leave","No employee-sensitive detail is exposed outside role scope"]}; }
  if(intent==="fleet") { const maintenance=fleet.reduce((s,x)=>s+x.maintenance,0), highest=[...fleet].sort((a,b)=>b.fuelRate-a.fuelRate)[0]; return {title:"Fleet fuel and maintenance analysis",subtitle:"Vehicle efficiency, odometer and service exposure",period,confidence:93,executiveSummary:`Fleet maintenance cost is ${pkr(maintenance)}. ${highest.vehicle} has the highest fuel consumption at ${highest.fuelRate} litres per 100 km and service is due ${highest.due}.`,metrics:[{label:"Maintenance cost",value:pkr(maintenance),detail:"Selected vehicles",tone:"warning"},{label:"Highest fuel rate",value:`${highest.fuelRate} L/100km`,detail:highest.vehicle,tone:"negative"},{label:"Distance covered",value:`${fleet.reduce((s,x)=>s+x.kilometres,0).toLocaleString()} km`,detail:"Lifetime odometer total",tone:"neutral"},{label:"Service due",value:"1 vehicle",detail:"Within 7 days",tone:"warning"}],findings:fleet.map(x=>({title:x.vehicle,detail:`${x.category} / ${x.kilometres.toLocaleString()} km`,value:`${x.fuelRate} L/100km`})),chartTitle:"Fuel consumption versus 18 L/100km benchmark",chartRows:fleet.map(x=>({label:x.vehicle,actual:x.fuelRate,benchmark:18,display:x.due})),columns:["Vehicle","Category","Odometer","Fuel rate","Maintenance cost","Next service"],rows:fleet.map(x=>[x.vehicle,x.category,`${x.kilometres.toLocaleString()} km`,`${x.fuelRate} L/100km`,pkr(x.maintenance),x.due]),sources:[{label:"Fuel register",reference:"Approved fuel entries",moduleId:"fleet",pageId:"fuel-register"},{label:"Maintenance history",reference:"Service work orders",moduleId:"fleet",pageId:"service-work-orders"}],actions:["Open vehicle activity","Review fuel exceptions","Schedule maintenance","Export fleet report"],assumptions:["Fuel rate is litres per 100 kilometres","Odometer is the vehicle lifetime distance reading","Maintenance cost excludes vehicle depreciation"]}; }
  const variance=taxItems.reduce((s,x)=>s+x.variance,0); return {title:"Tax compliance and reconciliation",subtitle:"GST, withholding and e-invoice readiness",period,confidence:97,executiveSummary:`Tax controls identified ${pkr(variance)} of monetary reconciliation differences and 7 e-invoice exceptions. Output GST is reconciled; input GST and withholding require review.`,metrics:[{label:"Output GST",value:pkr(taxItems[0].calculated),detail:"Reconciled",tone:"positive"},{label:"Input GST variance",value:pkr(taxItems[1].variance),detail:"Ledger review",tone:"negative"},{label:"Withholding variance",value:pkr(taxItems[2].variance),detail:"Document review",tone:"warning"},{label:"E-invoice exceptions",value:"7",detail:"421 of 428 ready",tone:"warning"}],findings:taxItems.slice(1).map(x=>({title:x.area,detail:x.status,value:x.area.includes("readiness")?`${x.variance} documents`:pkr(x.variance)})),chartTitle:"Calculated versus ledger value",chartRows:taxItems.slice(0,3).map(x=>({label:x.area,actual:x.ledger,benchmark:x.calculated,display:x.status})),columns:["Tax area","Calculated","Ledger / ready","Variance","Status"],rows:taxItems.map(x=>[x.area,String(x.calculated),String(x.ledger),String(x.variance),x.status]),sources:[{label:"Tax ledger",reference:"September tax period",moduleId:"tax",pageId:"tax-reconciliation"},{label:"Document validation",reference:"428 documents",moduleId:"tax",pageId:"tax-exceptions"}],actions:["Open tax exceptions","Review input GST","Prepare reconciliation","Export compliance report"],assumptions:["Values follow configured prototype tax profiles","Returns are not submitted by the prototype","Human tax review remains mandatory"]};
}

function companyOverview(period: string, context: QueryContext): Omit<AiAnalysisResult,"id"|"question"|"intent"> {
  return {title:"Company performance overview",subtitle:`Interpreted for ${context.roleLabel} from ${context.moduleLabel}`,period,confidence:89,executiveSummary:"Nexora interpreted the question as a company-wide request. Revenue is slightly below plan, liquidity remains positive, overdue receivables and one production material shortage are the most important current exceptions.",metrics:[{label:"Revenue",value:"PKR 46.9M",detail:"-0.6% vs target",tone:"warning"},{label:"Available cash",value:"PKR 36.11M",detail:"1.42x liquidity coverage",tone:"positive"},{label:"Overdue receivables",value:"PKR 7.41M",detail:"2 high-risk customers",tone:"negative"},{label:"Production attainment",value:"95.0%",detail:"One material shortage",tone:"warning"}],findings:[{title:"Working capital",detail:"Collections are the fastest cash opportunity",value:"PKR 7.41M overdue"},{title:"Operations",detail:"Servo drive shortage threatens one order",value:"180 units short"},{title:"Commercial",detail:"Professional Services margin below prior month",value:"-3.6 pts"}],chartTitle:"Enterprise indicator versus plan",chartRows:[{label:"Revenue",actual:99.4,benchmark:100,display:"-0.6%"},{label:"Cash coverage",actual:142,benchmark:100,display:"1.42x"},{label:"Collections",actual:73,benchmark:100,display:"PKR 7.41M overdue"},{label:"Production",actual:95,benchmark:100,display:"95.0%"}],columns:["Priority","Business area","Current condition","Impact","Recommended next step"],rows:[["1","Receivables","2 high-risk customers","PKR 4.67M","Open collection workbench"],["2","Production","Material shortage","180 units","Review alternate source"],["3","Margin","Services below prior month","-3.6 pts","Open margin bridge"]],sources:[{label:"Executive scorecard",reference:"September 2026",moduleId:"dashboard",pageId:"ceo-executive-dashboard"},{label:"Financial reports",reference:"Posted through 31 Aug",moduleId:"reports",pageId:"report-catalogue"},{label:"Operational exceptions",reference:"Current open workflow",moduleId:"approvals",pageId:"my-approvals"}],actions:["Open executive dashboard","Analyse receivables","Analyse production","Create management brief"],assumptions:["The question did not name a specific metric, so a company overview was selected","Results remain limited to the current role and company","Prototype data is illustrative and not live"]};
}

export function analyseCompanyQuestion(question: string, context: QueryContext): AiAnalysisResult {
  const cleanQuestion = question.trim() || "Give me a company performance overview";
  const intent = detectIntent(cleanQuestion);
  const period = periodFrom(cleanQuestion);
  let body: Omit<AiAnalysisResult,"id"|"question"|"intent">;
  if (intent === "price-variance") body = analysePriceVariance(cleanQuestion, period);
  else if (intent === "sales-margin") body = analyseSales(period);
  else if (intent === "cash-liquidity") body = analyseCash(period);
  else if (intent === "receivables") body = analyseReceivables(period);
  else if (intent === "company-overview") body = companyOverview(period, context);
  else body = simpleOperationalReport(intent, period);
  return { id: idFor(intent, cleanQuestion), question: cleanQuestion, intent, ...body };
}
