from __future__ import annotations

import re
from collections import Counter
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Nexora_ERP_Prototype_Modules_and_Forms_User_Guide.pdf"
SOURCE = ROOT / "app" / "prototype-data.ts"

NAVY = colors.HexColor("#183B56")
SECONDARY = colors.HexColor("#2F5D7C")
ACCENT = colors.HexColor("#4F8FBF")
BACKGROUND = colors.HexColor("#F5F7FA")
TEXT = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#6B7280")
BORDER = colors.HexColor("#D9E1E8")
SUCCESS = colors.HexColor("#2E7D5B")
WARNING = colors.HexColor("#C58A18")
ERROR = colors.HexColor("#C44747")
WHITE = colors.white


def clean(value: str) -> str:
    replacements = {
        "\u2013": "-", "\u2014": "-", "\u2192": ">", "\u00b0": " degrees",
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
        "\u00a0": " ", "\u2022": "*", "\u00b7": "-", "&": "&amp;",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def parse_catalogue() -> list[dict]:
    source = SOURCE.read_text(encoding="utf-8")
    starts = list(re.finditer(
        r'^    id: "([^"]+)", code: "([^"]+)", label: "([^"]+)", shortLabel: "([^"]+)",',
        source,
        re.MULTILINE,
    ))
    modules: list[dict] = []
    for index, match in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else source.index("] as const", match.start())
        block = source[match.start():end]
        description_match = re.search(r'description: "([^"]+)"', block)
        groups = []
        for group_match in re.finditer(r'g\("([^"]+)",\s*"([^"]+)",\s*\[(.*?)\]\)', block, re.DOTALL):
            pages = []
            for page_match in re.finditer(
                r'p\("([^"]+)",\s*"([^"]+)"(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\)',
                group_match.group(3),
            ):
                pages.append({
                    "id": page_match.group(1),
                    "label": page_match.group(2),
                    "archetype": page_match.group(3) or "list",
                    "status": page_match.group(4) or "prototype",
                })
            groups.append({"id": group_match.group(1), "label": group_match.group(2), "pages": pages})
        modules.append({
            "id": match.group(1), "code": match.group(2), "label": match.group(3),
            "short": match.group(4), "description": description_match.group(1) if description_match else "",
            "groups": groups,
        })
    return modules


WORKFLOWS = {
    "dashboard": "Select role and company > review KPIs > open exception > drill into report > reach source transaction",
    "banking": "Create payment/receipt/transfer > validate balance and beneficiary > approve > post > reconcile to statement",
    "sales": "Quotation > approval > sales order > pick/dispatch > invoice > receipt > customer reconciliation",
    "revenue": "Contract > performance obligations > billing schedule > recognition run > exception review > renewal",
    "customers": "Onboard customer > approve credit > invoice/open item > collect and allocate > statement > AR-to-GL reconciliation",
    "purchases": "Requisition > RFQ > supplier evaluation > purchase order > receipt/inspection > bill match > payment",
    "suppliers": "Onboard and verify supplier > record payable > hold/review > propose payment > approve > reconcile",
    "inventory": "Create item > receive/reserve > pick/move/count > adjust with approval > value stock > reconcile to GL",
    "costing": "Capture landed charges > select allocation basis > preview > approve/post > analyse item cost and variance",
    "finance": "Maintain chart > prepare balanced journal > approve/post > review ledgers > close period > report and trace",
    "tax": "Configure jurisdiction and rule > calculate transaction tax > resolve exceptions > submit return > reconcile evidence",
    "operations": "Create work order > plan and assign > execute checklist > record exception > accept completion > report",
    "fleet": "Register vehicle/driver > assign > dispatch trip > capture fuel and road cost > maintain > renew compliance > analyse cost",
    "manufacturing": "Maintain BOM/routing > plan MRP > create MO > approve/release > issue material > produce/inspect > close variance",
    "quality": "Define specification > queue inspection > record result > quarantine/disposition > CAPA > trace and report",
    "crm": "Capture lead > qualify > manage opportunity and activities > proposal handoff > forecast > convert to sale",
    "projects": "Set up contract/WBS > budget and resource > deliver/time capture > approve > bill/recognise > close",
    "resources": "Maintain skills and capacity > request allocation > approve > schedule > monitor utilisation and bench",
    "support": "Log ticket > classify and prioritise > check SLA/entitlement > assign > resolve > accept > renew support",
    "hr": "Create employee > onboard > attendance/leave > payroll inputs > validate/approve payroll > pay > offboard",
    "assets": "Acquire/CWIP > capitalise > assign > depreciate/revalue > verify > transfer > dispose or manage lease",
    "expenses": "Capture claim/receipt > policy validation > manager/finance approval > reimburse > account and reconcile",
    "documents": "Upload > classify and link > version/review > approve access > retain/hold > expire or renew",
    "budget": "Create scenario/model > enter or import budget > validate > approve > forecast > compare actual and commitment",
    "reports": "Find report > set filters > run > analyse > drill through layers > export/schedule > trace source",
    "portals": "Authenticate stakeholder > view permitted records > submit request/document > follow status > communicate",
    "administration": "Set up organisation > create user > assign role/company > review access > monitor sessions and audit",
    "configuration": "Configure core settings > assess impact > review/approve > test > release > retain version history",
    "approvals": "Open assigned work > review document and policy > approve/reject/return > escalate/delegate > audit decision",
    "notifications": "Configure event/template/channel > deliver > monitor failure > retry/escalate > review preference",
    "integrations": "Configure connection and mapping > test > run > monitor messages > retry error > reconcile",
    "ai": "Ask or submit content > review sources/confidence > accept/edit/reject recommendation > retain human decision",
    "audit": "Select scope > search events > drill to transaction/change > collect evidence > test control > close finding",
    "migration": "Define project/object > upload/profile > map > validate/dry run > correct > load > reconcile/sign off",
    "mobile": "Sign in > select mobile task > scan/capture/approve > validate > sync > resolve offline conflict",
}

CONTROL_HINTS = {
    "banking": "Bank balance, beneficiary verification, value date, currency, approval limit, reconciliation status",
    "sales": "Customer credit, stock, price history, margin, tax, discount, delivery and receivable impact",
    "purchases": "Budget, supplier status, quotation comparison, quantity tolerance, tax and 2/3-way match",
    "inventory": "Warehouse/bin, available quantity, batch/serial, unit of measure, valuation and approval",
    "finance": "Auto-generated reference, open period, active nominal, debit/credit balance, approval and posting trail",
    "fleet": "Vehicle/driver eligibility, current odometer, quantity, separate rate and amount, cost centre and evidence",
    "manufacturing": "Approved BOM/routing, material availability, tolerance, capacity, quality gate and variance",
    "hr": "Employee eligibility, policy, entitlement, manager approval, effective date and payroll impact",
    "assets": "Asset class, cost components, useful life, depreciation, custodian, location and book value",
    "default": "Auto-generated code, required fields, company/branch, owner, status, attachment and approval route",
}

FORM_OVERRIDES = {
    "Add Bank Payment": ("Record an outgoing bank or cash payment.", "Select bank and value date; enter beneficiary/purpose and separate allocation lines; confirm currency and available balance; save draft or submit."),
    "Add Bank Receipt": ("Record incoming funds and their intended allocation.", "Select receiving account; identify payer and reference; enter amount; allocate to invoices or nominal accounts; validate and submit."),
    "Manual Journal": ("Create a controlled double-entry accounting journal.", "Select posting date and type; enter debit and credit lines; assign dimensions; attach evidence; confirm zero variance; submit for approval and post."),
    "Add Invoice": ("Create a customer invoice from an order, delivery, contract or direct entry.", "Select customer and terms; add products/services; review stock, price, margin, tax and discount; confirm totals; submit, approve and post."),
    "Add Purchase Order": ("Create an authorised commitment to a supplier.", "Select supplier or awarded RFQ; add items/services, dates, warehouses and prices; review budget and taxes; submit for approval."),
    "Add Purchase Bill": ("Record a supplier invoice and match it to purchasing evidence.", "Select supplier and bill reference; copy PO/GRN/service entry; verify quantities, rates, taxes and match exceptions; submit and post."),
    "BOM Editor": ("Define the approved materials, operations and by-products required to make a product.", "Select finished product and revision; enter component quantities and operations; set scrap/tolerance; validate cost and effective dates; submit for approval."),
    "Add Production Order": ("Authorise production of a planned quantity using an approved BOM and routing.", "Select product, BOM, quantity and dates; check materials/capacity; approve and release; record issues, output, scrap and variance; close."),
    "Add Fuel Entry": ("Record a vehicle refuelling event and calculate fuel cost and economy.", "Select vehicle and driver; enter current odometer, fuel quantity and rate per litre in separate fields; verify the auto-calculated amount; attach receipt; submit."),
    "Add Service Work Order": ("Plan, approve and control vehicle maintenance work.", "Select vehicle and service type; enter odometer and diagnosis; record labour quantity, labour rate, labour amount, parts amount and total separately; assign workshop; approve and complete."),
}

def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle("CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=30, leading=35, textColor=WHITE, alignment=TA_LEFT, spaceAfter=8),
        "cover_sub": ParagraphStyle("CoverSub", parent=base["BodyText"], fontName="Helvetica", fontSize=12, leading=17, textColor=colors.HexColor("#DCE8F2")),
        "h1": ParagraphStyle("Heading1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=NAVY, spaceBefore=8, spaceAfter=8, keepWithNext=True),
        "h2": ParagraphStyle("Heading2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=SECONDARY, spaceBefore=7, spaceAfter=5, keepWithNext=True),
        "h3": ParagraphStyle("Heading3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NAVY, spaceBefore=5, spaceAfter=3, keepWithNext=True),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName="Helvetica", fontSize=8.6, leading=12, textColor=TEXT, spaceAfter=5),
        "small": ParagraphStyle("Small", parent=base["BodyText"], fontName="Helvetica", fontSize=7.3, leading=9.5, textColor=MUTED, spaceAfter=3),
        "cell": ParagraphStyle("Cell", parent=base["BodyText"], fontName="Helvetica", fontSize=6.8, leading=8.5, textColor=TEXT),
        "cell_bold": ParagraphStyle("CellBold", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=6.8, leading=8.5, textColor=NAVY),
        "cell_head": ParagraphStyle("CellHead", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=6.7, leading=8, textColor=WHITE, alignment=TA_LEFT),
        "callout": ParagraphStyle("Callout", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=8.5, leading=12, textColor=NAVY),
        "toc": ParagraphStyle("TOC", parent=base["BodyText"], fontName="Helvetica", fontSize=8.2, leading=12, textColor=TEXT),
    }


STYLES = make_styles()


class NexoraDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=16 * mm,
            rightMargin=16 * mm,
            topMargin=20 * mm,
            bottomMargin=16 * mm,
            title="Nexora ERP Prototype - Modules and Forms User Guide",
            author="Nexora ERP Product Team",
            subject="Complete prototype module, form, workflow and usage guide",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates(PageTemplate(id="content", frames=[frame], onPage=self._draw_page))

    def _draw_page(self, canvas, doc):
        page = canvas.getPageNumber()
        canvas.saveState()
        if page == 1:
            canvas.setFillColor(NAVY)
            canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
            canvas.setFillColor(ACCENT)
            canvas.rect(0, 0, 9 * mm, A4[1], fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#2F5D7C"))
            canvas.circle(A4[0] - 34 * mm, A4[1] - 31 * mm, 42 * mm, fill=1, stroke=0)
        else:
            canvas.setStrokeColor(BORDER)
            canvas.line(16 * mm, A4[1] - 14 * mm, A4[0] - 16 * mm, A4[1] - 14 * mm)
            canvas.setFont("Helvetica-Bold", 7)
            canvas.setFillColor(NAVY)
            canvas.drawString(16 * mm, A4[1] - 10.5 * mm, "NEXORA ERP - PROTOTYPE USER GUIDE")
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(MUTED)
            canvas.drawRightString(A4[0] - 16 * mm, A4[1] - 10.5 * mm, "Module and Form Reference")
            canvas.line(16 * mm, 11 * mm, A4[0] - 16 * mm, 11 * mm)
            canvas.drawString(16 * mm, 7 * mm, "Mock-only prototype - no live accounting or business transaction")
            canvas.drawRightString(A4[0] - 16 * mm, 7 * mm, f"Page {page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            if style in {"Heading1", "Heading2"}:
                level = 0 if style == "Heading1" else 1
                text = flowable.getPlainText()
                key = f"toc-{level}-{self.seq.nextf('heading')}"
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=level, closed=False)
                self.notify("TOCEntry", (level, text, self.page, key))

def P(text: str, style: str = "body") -> Paragraph:
    return Paragraph(clean(text), STYLES[style])


def data_table(data, widths, header=True, repeat_rows=1):
    prepared = []
    for row_index, row in enumerate(data):
        style = "cell_head" if header and row_index == 0 else "cell"
        prepared.append([value if hasattr(value, "wrap") else P(str(value), style) for value in row])
    table = Table(prepared, colWidths=widths, repeatRows=repeat_rows if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [WHITE, BACKGROUND]),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE)]
    table.setStyle(TableStyle(commands))
    return table


def callout(title: str, text: str, tone=ACCENT):
    table = Table([[P(title, "callout"), P(text, "body")]], colWidths=[43 * mm, 130 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EAF1F6")),
        ("BOX", (0, 0), (-1, -1), 0.6, tone),
        ("LINEBEFORE", (0, 0), (0, -1), 4, tone),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def archetype_function(archetype: str) -> str:
    return {
        "dashboard": "Monitor KPIs, trends, alerts and priorities; select a chart or KPI to investigate.",
        "list": "Search, filter, sort and open records; use saved views, bulk actions and export where available.",
        "detail": "Review a 360-degree record, related documents, status, accounting links, attachments and audit trail.",
        "form": "Create or amend a controlled record using validations, defaults, calculations and workflow actions.",
        "approval": "Review policy, evidence and exceptions; approve, reject, return or delegate with comments.",
        "workflow": "Move a business process through connected stages while resolving holds and exceptions.",
        "report": "Set parameters, run analysis, compare trends, drill to source and export or schedule output.",
        "settings": "Maintain policies, numbering, rules and defaults under controlled access and audit history.",
    }.get(archetype, "Review and manage the selected prototype workspace.")


def form_function(label: str, module: dict) -> tuple[str, str]:
    if label in FORM_OVERRIDES:
        return FORM_OVERRIDES[label]
    lowered = label.lower()
    if lowered.startswith(("add ", "new ", "create ")):
        purpose = f"Create a new {label.split(' ', 1)[1].lower()} record in {module['label']}."
    elif "editor" in lowered or "setup" in lowered:
        purpose = f"Maintain the controlled setup and attributes for {label.lower()}."
    elif any(word in lowered for word in ["import", "upload", "capture"]):
        purpose = f"Capture or import source information for {label.lower()} and validate it before processing."
    elif any(word in lowered for word in ["return", "reversal", "write-off", "dispose", "cancel"]):
        purpose = f"Record and control the exceptional or reversing process for {label.lower()}."
    else:
        purpose = f"Enter and control {label.lower()} information within {module['label']}."
    use = (
        f"Open {label}; confirm the automatically generated reference and company context; "
        "complete required header fields and any line details; review calculated totals and control messages; "
        "save a draft or validate and submit to the displayed approval route."
    )
    return purpose, use


def screen_counts(module: dict) -> Counter:
    return Counter(page["archetype"] for group in module["groups"] for page in group["pages"])


def module_form_rows(module: dict):
    result = []
    for group in module["groups"]:
        for page in group["pages"]:
            if page["archetype"] == "form":
                purpose, use = form_function(page["label"], module)
                controls = CONTROL_HINTS.get(module["id"], CONTROL_HINTS["default"])
                result.append([page["label"], purpose, use, controls])
    return result

def add_module_section(story: list, number: str, module: dict):
    counts = screen_counts(module)
    pages = [page for group in module["groups"] for page in group["pages"]]
    story.append(P(f"{number}. {module['code']} - {module['label']}", "h1"))
    story.append(P(module["description"], "body"))
    story.append(callout("Primary workflow", WORKFLOWS.get(module["id"], "Open workspace > create or review > validate > approve > complete > report")))
    mix = " | ".join(f"{name.title()}: {counts[name]}" for name in ["dashboard", "list", "form", "detail", "approval", "workflow", "report", "settings"] if counts[name])
    story.append(P(f"<b>Prototype coverage:</b> {len(module['groups'])} menu groups, {len(pages)} screens. {mix}", "small"))
    story.append(P("Menus, submenus and screen functions", "h2"))
    rows_data = [["Menu group", "Screens and their purpose"]]
    for group in module["groups"]:
        descriptions = []
        for page in group["pages"]:
            status = " [Coming Soon]" if page["status"] != "prototype" else ""
            descriptions.append(f"<b>{page['label']}</b> ({page['archetype']}){status}: {archetype_function(page['archetype'])}")
        rows_data.append([group["label"], "<br/>".join(descriptions)])
    story.append(data_table(rows_data, [39 * mm, 134 * mm]))
    forms = module_form_rows(module)
    story.append(P("Forms and data-entry instructions", "h2"))
    if forms:
        story.append(P(
            "All prototype forms use full-screen Nexora styling with an auto-generated reference, required-field validation, "
            "company and role context, business controls, evidence, approval routing and sticky Save/Submit actions.",
            "small",
        ))
        form_rows = [["Form", "Function", "How to use", "Key controls / result"]] + forms
        story.append(data_table(form_rows, [29 * mm, 40 * mm, 65 * mm, 39 * mm]))
    else:
        story.append(callout(
            "No standalone entry form",
            "This module is primarily used through dashboards, workbenches, lists, details, workflows or embedded quick actions. "
            "Open a record or workflow and use its contextual action bar.",
            SECONDARY,
        ))
    story.append(P("Recommended operating sequence", "h2"))
    steps = WORKFLOWS.get(module["id"], "").split(" > ")
    step_rows = [["Step", "User action", "Expected result"]]
    for index, step in enumerate(steps, start=1):
        result = "The next controlled stage becomes available." if index < len(steps) else "The record remains traceable for reporting and audit."
        step_rows.append([str(index), step.capitalize(), result])
    story.append(data_table(step_rows, [13 * mm, 78 * mm, 82 * mm]))
    story.append(PageBreak())


def add_global_guidance(story: list, modules: list[dict]):
    total_pages = sum(len(group["pages"]) for module in modules for group in module["groups"])
    total_forms = sum(1 for module in modules for group in module["groups"] for page in group["pages"] if page["archetype"] == "form")
    story.append(P("1. Purpose and scope", "h1"))
    story.append(P(
        f"This guide explains the isolated Nexora ERP UI/UX Prototype: {len(modules)} modules, "
        f"{sum(len(module['groups']) for module in modules)} menu groups, {total_pages} screens and {total_forms} dedicated forms. "
        "It describes what each module and form is for and how a reviewer or future user should operate it.",
        "body",
    ))
    story.append(callout(
        "Important prototype boundary",
        "Every value and transaction shown is dummy presentation data. The prototype does not create, post, approve, reverse or delete live Demo Account or production records.",
        WARNING,
    ))
    story.append(P("2. How to navigate Nexora", "h1"))
    navigation = [
        ["Area", "How to use it"],
        ["Master sidebar", "Expand a module, then expand a menu group and select a page. Click the module again to collapse it."],
        ["Collapsed sidebar", "Use the visible reopen arrow to restore the full menu."],
        ["Global search", "Press Ctrl+K (or Cmd+K) and type a module, page, party, reference, amount or status; select a result to navigate."],
        ["Breadcrumb", "Use the hierarchy above the workspace to understand Company > Module > Group > Page."],
        ["Role and company selectors", "Choose a role and service, trading or manufacturing company view. Scoped menus visually demonstrate permissions."],
        ["Tables", "Search, apply filters, sort columns, choose a saved view, select records, use bulk actions and open the reference link."],
        ["Dashboards", "Select a KPI, chart segment, alert or transaction to move through analytical layers toward the source record."],
        ["Forms", "Complete sections from top to bottom, review contextual information, validate, save a draft or submit."],
    ]
    story.append(data_table(navigation, [42 * mm, 131 * mm]))
    story.append(P("3. Standard record lifecycle", "h1"))
    lifecycle = [
        ["Stage", "Meaning", "Typical actions"],
        ["Draft", "Editable working record; no posting impact.", "Save draft, edit, delete draft, validate"],
        ["Submitted", "Prepared record sent to its policy route.", "View, comment, return, cancel where permitted"],
        ["Approved / Rejected", "Authorised decision with user, time and comments.", "Approve, reject, return for revision, delegate"],
        ["Posted", "Final accounting or operational effect is recorded.", "View, print, export, drill to journal/ledger"],
        ["Reversed / Cancelled", "Controlled neutralisation or closure; history remains.", "Reverse with reason, close, view audit trail"],
    ]
    story.append(data_table(lifecycle, [29 * mm, 75 * mm, 69 * mm]))
    story.append(P("4. Standard form anatomy", "h1"))
    form_anatomy = [
        ["Form area", "Function and usage"],
        ["Page header", "Shows module, form name, status and contextual actions such as Cancel, Save Draft and Save & Submit."],
        ["Identity section", "Contains auto-generated code/reference, date, company, branch, party or master-record identity."],
        ["Business context", "Shows balances, stock, previous price, budget, capacity, credit, compliance or other decision support."],
        ["Line-entry grid", "Capture products, services, accounts, quantities, rates, taxes, discounts and dimensions efficiently."],
        ["Validation and controls", "Checks required fields, duplicates, period, policy, tolerance, availability and approval requirements."],
        ["Evidence and notes", "Attach or reference quotations, receipts, contracts, inspection evidence and internal comments."],
        ["Action dock", "Keeps Cancel, Save Draft and Validate & Submit available at the bottom of long forms."],
    ]
    story.append(data_table(form_anatomy, [43 * mm, 130 * mm]))
    story.append(PageBreak())


def add_appendices(story: list):
    story.append(P("6. Action and control reference", "h1"))
    actions = [
        ["Action", "Function", "Important usage rule"],
        ["Add New / Create", "Starts a new draft master or transaction.", "Confirm the form type and company before entering data."],
        ["Save Draft", "Stores incomplete work without submitting.", "Drafts remain editable and have no posting impact."],
        ["Validate", "Runs field, business-rule and policy checks.", "Resolve errors before submission; review warnings deliberately."],
        ["Submit", "Sends the record into its approval workflow.", "Check totals, evidence, dimensions and approver route first."],
        ["Approve / Reject", "Records an authorised workflow decision.", "Read the source document and exceptions; include a clear comment."],
        ["Post", "Creates the final accounting or operational effect.", "Only approved, balanced and period-valid records should post."],
        ["Reverse", "Neutralises a posted effect while preserving history.", "Select the correct reversal date and provide a mandatory reason."],
        ["Cancel / Delete", "Cancels a permitted record or removes a draft.", "Posted history must not be deleted; use reversal or controlled closure."],
        ["View / Drill Down", "Opens the detailed record or next analytical layer.", "Continue until the source transaction and audit evidence are visible."],
        ["Print / Export", "Produces a reviewable or portable output.", "Confirm filters, company, currency and as-of date in the output."],
        ["Filter / Search", "Narrows a list or report to the intended population.", "Use date range, status, creator, company, branch and module-specific facets."],
        ["Refresh", "Reloads the latest prototype state.", "The prototype remains deterministic and does not call live APIs."],
    ]
    story.append(data_table(actions, [31 * mm, 65 * mm, 77 * mm]))
    story.append(P("7. Status glossary", "h1"))
    statuses = [
        ["Status", "Meaning"],
        ["Draft", "Record is being prepared and can still be edited."],
        ["Pending approval / Submitted", "Record is waiting for an authorised decision."],
        ["Approved", "Required workflow decision is complete; posting or execution may follow."],
        ["Posted", "Accounting or business impact has been finalised."],
        ["In progress / In transit", "Operational execution has started but is not complete."],
        ["On hold / Exception", "A policy, data, budget, quality, compliance or availability issue blocks progress."],
        ["Completed / Closed", "Operational work is complete and evidence is retained."],
        ["Rejected / Returned", "The record requires correction or will not proceed."],
        ["Reversed / Cancelled", "The original effect has been neutralised or the process stopped with history preserved."],
    ]
    story.append(data_table(statuses, [44 * mm, 129 * mm]))
    story.append(P("8. Data-entry quality checklist", "h1"))
    checklist = [
        "Confirm the correct company, branch, department, project and cost centre.",
        "Use the system-generated code or document reference; never edit protected numbering.",
        "Select active master records and verify party, bank, item, vehicle, driver or nominal details.",
        "Enter dates in an open and appropriate period, including due date and effective date where relevant.",
        "Enter quantity, unit, rate, discount, tax and amount in separate fields; review automatic calculations.",
        "Review contextual intelligence such as available balance, stock, previous price, credit, capacity or odometer.",
        "Attach or reference the required source evidence and add clear notes for exceptions.",
        "Resolve blocking validation errors and consciously accept or escalate warnings.",
        "Verify approval routing and segregation of duties before submitting.",
        "After posting or completion, use drill-down and audit history to confirm the final result.",
    ]
    story.append(data_table([["No.", "Check"]] + [[str(i), item] for i, item in enumerate(checklist, 1)], [13 * mm, 160 * mm]))
    story.append(P("9. Fleet-specific terminology", "h1"))
    story.append(callout(
        "Odometer",
        "The odometer is the vehicle's total lifetime distance reading. Example: 84,260 km means the vehicle has travelled 84,260 kilometres since new. Nexora uses it to calculate fuel economy, detect unusual usage and trigger maintenance.",
    ))
    story.append(Spacer(1, 4 * mm))
    fleet_terms = [
        ["Term", "Meaning / usage"],
        ["Fuel quantity", "The litres or other unit purchased."],
        ["Rate per litre", "The price of one fuel unit. This must remain separate from amount."],
        ["Fuel amount", "Quantity multiplied by rate, normally auto-calculated and checked against the receipt."],
        ["Labour quantity", "Maintenance hours or units of service."],
        ["Labour rate", "Price per labour hour or unit."],
        ["Labour amount", "Labour quantity multiplied by labour rate."],
        ["Parts amount", "Total value of inventory or supplier parts used."],
        ["Total maintenance amount", "Labour amount plus parts and other approved service charges."],
        ["Fuel economy", "Distance travelled divided by fuel consumed, such as kilometres per litre."],
    ]
    story.append(data_table(fleet_terms, [45 * mm, 128 * mm]))
    story.append(P("10. Prototype access and limitation", "h1"))
    story.append(P(
        "Review URL: https://nexora-erp-uiux-prototype.rosy-snail-3485.chatgpt.site. "
        "The site is an isolated visual prototype. Buttons demonstrate intended product behaviour; they do not execute live accounting, banking, payroll, tax, inventory, fleet or manufacturing transactions.",
        "body",
    ))


def build_pdf():
    modules = parse_catalogue()
    if len(modules) != 35:
        raise ValueError(f"Expected 35 modules, found {len(modules)}")
    total_pages = sum(len(group["pages"]) for module in modules for group in module["groups"])
    if total_pages != 706:
        raise ValueError(f"Expected 706 screens, found {total_pages}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = NexoraDocTemplate(str(OUTPUT))
    story = [
        Spacer(1, 42 * mm),
        P("NEXORA ERP", "cover_sub"),
        Spacer(1, 5 * mm),
        P("Prototype Modules and Forms User Guide", "cover_title"),
        Spacer(1, 6 * mm),
        P("Complete functional reference for navigation, dashboards, workflows, forms, controls, approvals, reports and everyday prototype usage.", "cover_sub"),
        Spacer(1, 35 * mm),
        P("<b>Coverage</b><br/>35 modules | 135 menu groups | 706 screens | 102 dedicated forms", "cover_sub"),
        Spacer(1, 12 * mm),
        P("<b>Document version</b><br/>1.0 - 15 September 2026", "cover_sub"),
        Spacer(1, 12 * mm),
        P("<b>Environment</b><br/>Isolated UI/UX prototype - mock data only", "cover_sub"),
        PageBreak(),
        P("Contents", "h1"),
    ]
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOCLevel1", fontName="Helvetica-Bold", fontSize=8.5, leading=12, leftIndent=0, firstLineIndent=0, textColor=NAVY, spaceBefore=2),
        ParagraphStyle("TOCLevel2", fontName="Helvetica", fontSize=7.5, leading=10, leftIndent=12, firstLineIndent=0, textColor=SECONDARY),
    ]
    story.extend([toc, PageBreak()])
    add_global_guidance(story, modules)
    story.append(P("5. Complete module reference", "h1"))
    story.append(P(
        "The following chapters describe every module, menu group, screen function, dedicated form and recommended operating sequence in the current prototype.",
        "body",
    ))
    story.append(PageBreak())
    for index, module in enumerate(modules, start=1):
        add_module_section(story, f"5.{index}", module)
    add_appendices(story)
    doc.multiBuild(story)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
