import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Generate with npm run security:fixtures before running these local journeys.
const fixturePath = "security-fixtures/fixtures.json";
const fixtures = (() => {
  try { return JSON.parse(readFileSync(fixturePath, "utf8")); }
  catch { return null; }
})();
test.skip(!fixtures, "Run npm run security:fixtures to create the local synthetic workspace.");

async function login(page: Page, key: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(fixtures.accounts[key].email);
  await page.getByLabel("Password", { exact: true }).fill(fixtures.password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/cases$/);
}

test("create a case, upload, send, receive, accept and revoke through the UI", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await login(page, "sender");
  await page.getByRole("button", { name: "New case", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const reference = `BURP-UI-${randomUUID().slice(0, 8)}`;
  await dialog.getByLabel("Case title").fill("Synthetic browser transfer check");
  await dialog.getByLabel("Case reference").fill(reference);
  await dialog.getByLabel("Default security level").selectOption("2");
  await dialog.getByRole("button", { name: "Create case", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/cases\/[a-f0-9-]+$/);

  await page.getByRole("tab", { name: /Documents/ }).click();
  await page.getByRole("button", { name: "Upload document", exact: true }).click();
  await dialog.locator('input[type="file"]').setInputFiles("public/sample/brieflock-sample.pdf");
  await dialog.getByRole("button", { name: "Upload document", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await page.goto("/transfers");
  await page.getByRole("button", { name: "New transfer", exact: true }).click();
  await dialog.getByLabel("Case", { exact: true }).selectOption({ label: `Synthetic browser transfer check · ${reference}` });
  await dialog.getByLabel("Receiving firm").selectOption(fixtures.firms.beta.id);
  await dialog.getByRole("checkbox", { name: "BURP receiver (test)", exact: true }).check();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Select all" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Send transfer", exact: true }).click();
  await expect(page).toHaveURL(/\/transfers\/[a-f0-9-]+$/);
  const transferPath = new URL(page.url()).pathname;
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeVisible();

  const receiverContext = await browser.newContext();
  const recipient = await receiverContext.newPage();
  try {
    await login(recipient, "receiver");
    await recipient.goto("/transfers");
    await expect(recipient.getByRole("tab", { name: /Incoming/ })).toHaveAttribute("aria-selected", "true");
    await recipient.goto(transferPath);
    await recipient.getByRole("button", { name: "Accept transfer", exact: true }).click();
    await recipient.getByRole("dialog").getByRole("button", { name: "Accept transfer", exact: true }).click();
    await expect(recipient.getByRole("dialog")).toBeHidden();
    await expect(recipient.getByRole("button", { name: "Accept transfer", exact: true })).toHaveCount(0);

    await page.reload();
    await page.getByRole("button", { name: "Revoke access", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke access", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Revoke access", exact: true })).toHaveCount(0);
    await recipient.reload();
    await expect(recipient.getByText("Access revoked", { exact: true })).toBeVisible();
  } finally {
    await receiverContext.close();
  }
});

test("admin can invite security personnel but cannot open audit", async ({ page }) => {
  await login(page, "sender");
  await expect(page.getByRole("link", { name: "Audit log", exact: true })).toHaveCount(0);
  await page.goto("/audit");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.goto("/members");
  await page.getByRole("button", { name: /Invite member/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address").fill(`ui-${randomUUID()}@burp-alpha.test`);
  await dialog.getByLabel("Role", { exact: true }).selectOption("security");
  await dialog.getByLabel("Clearance", { exact: true }).selectOption("1");
  await dialog.getByRole("button", { name: /Send invitation/ }).click();
  await expect(dialog.getByLabel("Invitation link")).toHaveValue(/\/invite\/accept\?token=/);
});

test("security sees firm audit without gaining member management", async ({ page }) => {
  await login(page, "security");
  await expect(page.getByRole("link", { name: "Audit log", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Export/ })).toBeVisible();
  await page.goto("/members");
  await expect(page.getByRole("alertdialog")).toBeVisible();
});
