import { expect, type Page } from "@playwright/test";

/** Operate the actual directory popup (or an unchanged native ERP select). */
export async function chooseBankDirectory(page: Page, label: string, text: string) {
  const control = page.getByLabel(label, { exact: true });
  await expect(control).toBeEnabled();
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    const option = control.locator("option").filter({ hasText: text });
    await expect(option).toHaveCount(1);
    const value = await option.getAttribute("value");
    expect(value).toBeTruthy();
    await control.selectOption(value!);
    return value!;
  }
  await control.click();
  const search = page.getByRole("combobox").and(page.locator("input"));
  await expect(search).toBeFocused();
  await search.fill(text);
  const option = page.getByRole("listbox").getByRole("option").filter({ hasText: text });
  await expect(option).toHaveCount(1);
  await expect(option).not.toHaveAttribute("aria-disabled", "true");
  await search.press("ArrowDown");
  await expect(option).toHaveAttribute("data-highlighted", "");
  await search.press("Enter");
  await expect(search).toHaveCount(0);
  await expect(control).not.toHaveAttribute("data-value", "");
  const value = await control.getAttribute("data-value");
  expect(value).toBeTruthy();
  return value!;
}
