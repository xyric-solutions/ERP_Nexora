import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

interface HrScreen {
  group_id: string;
  page_id: string;
  page_label: string;
}

interface JourneyStep {
  label: string;
  pageId: string;
}

const evidenceDirectory = join(dirname(fileURLToPath(import.meta.url)), "baseline");
const parityPath = join(evidenceDirectory, "..", "..", "..", "docs", "parity", "hr-screen-parity.csv");
const preferencesKey = "nexora-prototype-preferences-v2";
const themePreferenceKey = "nexora-theme-preference-v1";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

async function loadHrScreens(): Promise<HrScreen[]> {
  const [headerLine, ...lines] = (await readFile(parityPath, "utf8")).trim().split(/\r?\n/);
  if (!headerLine) throw new Error("HR parity register has no header");
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return { group_id: row.group_id, page_id: row.page_id, page_label: row.page_label };
  });
}

async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Search transactions and pages" })).toBeVisible();
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, preferencesKey);
}

async function openScreen(page: Page, screen: HrScreen): Promise<void> {
  await page.goto(`/#/hr/${screen.page_id}`);
  await waitForShell(page);
  await expect(
    page.getByRole("list", { name: "Breadcrumb" }).getByText(screen.page_label, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

async function openPageWithKeyboard(page: Page, step: JourneyStep): Promise<void> {
  await waitForShell(page);
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Global prototype search" });
  await expect(dialog).toBeVisible();
  const search = dialog.getByPlaceholder(/Try/);
  await expect(search).toBeFocused();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(step.label);
  await expect(
    dialog.getByRole("button").filter({ hasText: step.label }).filter({ hasText: "Page" }).first(),
  ).toBeVisible();

  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    if (active.tag === "BUTTON" && active.text.includes(step.label) && active.text.endsWith("Page")) {
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`#\\/hr\\/${step.pageId}$`));
      await waitForShell(page);
      return;
    }
  }
  throw new Error(`Keyboard search did not focus the page result for ${step.label}`);
}

async function runJourney(page: Page, name: string, steps: readonly JourneyStep[]): Promise<void> {
  for (const step of steps) await openPageWithKeyboard(page, step);
  await expect(page).toHaveScreenshot(`journey--${name}.png`, {
    animations: "disabled",
    fullPage: false,
    maxDiffPixelRatio: 0.01,
  });
}

test.describe("Wave 0 HR visual baseline", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ prototypePreferencesKey, appearanceKey }) => {
        window.localStorage.removeItem(prototypePreferencesKey);
        window.localStorage.setItem(appearanceKey, "light");
      },
      { prototypePreferencesKey: preferencesKey, appearanceKey: themePreferenceKey },
    );
  });

  test("captures all 67 HR screens at the desktop baseline", async ({ page }) => {
    test.setTimeout(180_000);
    const screens = await loadHrScreens();
    expect(screens).toHaveLength(67);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const screen of screens) {
      await openScreen(page, screen);
      await expect(page).toHaveScreenshot(["desktop", `${screen.group_id}--${screen.page_id}.png`], {
        animations: "disabled",
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      });
    }
  });

  test("captures the seven representative mobile screens", async ({ page }) => {
    test.setTimeout(90_000);
    const mobileIds = new Set([
      "employees",
      "recruitment-pipeline",
      "monthly-attendance",
      "leave-requests",
      "payroll-runs",
      "offboarding",
      "hr-report-centre",
    ]);
    const screens = (await loadHrScreens()).filter((screen) => mobileIds.has(screen.page_id));
    expect(screens).toHaveLength(7);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const screen of screens) {
      await openScreen(page, screen);
      await expect(page).toHaveScreenshot(["mobile", `${screen.group_id}--${screen.page_id}.png`], {
        animations: "disabled",
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      });
    }
  });

  test("completes the recruitment journey by keyboard", async ({ page }) => {
    await page.goto("/#/hr/manpower-requisitions");
    await runJourney(page, "recruitment", [
      { label: "Job Openings", pageId: "job-openings" },
      { label: "Recruitment Pipeline", pageId: "recruitment-pipeline" },
      { label: "Interviews & Evaluations", pageId: "interviews" },
      { label: "Offer Management", pageId: "offers" },
    ]);
  });

  test("completes the attendance journey by keyboard", async ({ page }) => {
    await page.goto("/#/hr/shifts");
    await runJourney(page, "attendance", [
      { label: "Daily Attendance", pageId: "daily-attendance" },
      { label: "Attendance Corrections", pageId: "attendance-corrections" },
      { label: "Monthly Attendance", pageId: "monthly-attendance" },
      { label: "Attendance Period Close", pageId: "attendance-period" },
      { label: "Attendance → Payroll Inputs", pageId: "attendance-payroll-inputs" },
    ]);
  });

  test("completes the payroll journey by keyboard", async ({ page }) => {
    await page.goto("/#/hr/payroll-inputs");
    await runJourney(page, "payroll", [
      { label: "Payroll Runs", pageId: "payroll-runs" },
      { label: "Payroll Review & Approval", pageId: "payroll-validation" },
      { label: "Payroll Journal", pageId: "payroll-journal" },
      { label: "Payment Batch", pageId: "payment-batch" },
      { label: "Payslips & Payment Handoff", pageId: "payslips" },
    ]);
  });

  test("completes the separation journey by keyboard", async ({ page }) => {
    await page.goto("/#/hr/resignations");
    await runJourney(page, "separation", [
      { label: "Exit Clearance", pageId: "clearance" },
      { label: "Final Settlements", pageId: "final-settlements" },
      { label: "Offboarding Control Centre", pageId: "offboarding" },
    ]);
  });
});
