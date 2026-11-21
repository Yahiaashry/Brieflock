import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("the signup page can load its scripts under the production security policy", async ({ page }) => {
  const response = await page.goto("/signup");
  expect(response?.status()).toBe(200);
  const nonce = response?.headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(await response?.text()).toContain(`nonce="${nonce}"`);
});

test("sign-in controls work in a narrow viewport and private routes redirect", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const login = await page.goto("/cases");
  await expect(page).toHaveURL(/\/login\?next=%2Fcases$/);
  expect(login?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  await expect(page.getByRole("heading", { name: "Sign in to BriefLock" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const password = page.getByLabel("Password", { exact: true });
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(password).toHaveCount(0);
  await page.getByRole("button", { name: "Use a password instead" }).click();
  await expect(password).toBeVisible();

  const email = page.getByLabel("Work email");
  await email.fill("example@firm.test");
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  await expect(password).toHaveCount(0);
  await expect(email).toHaveValue("example@firm.test");
  await expect(page.getByRole("button", { name: "Resend confirmation email" })).toBeVisible();

  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?link=invalid$/);
  await expect(page.getByRole("alert").filter({ hasText: "This sign-in link is no longer valid" })).toBeVisible();

  await page.goto("/cases?tab=documents");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/cases?tab=documents");

  await page.goto("/auth/callback?next=%2Fcases%3Ftab%3Ddocuments");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/cases?tab=documents");
});

test("sign in, upload a case PDF, and open the watermarked viewer", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to BriefLock" })).toBeVisible();
  await page.getByLabel("Work email").fill("marcus@hartwellroe.test");
  await page.getByLabel("Password", { exact: true }).fill("BriefLock!23");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Your matters, at a glance" })).toBeVisible();

  await page.getByRole("link", { name: /State v\. Dolan/ }).click();
  await expect(page.getByRole("heading", { name: "Case overview" })).toBeVisible();
  const overview = page.getByRole("tab", { name: "Overview" });
  await overview.focus();
  await overview.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Documents/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Upload document" }).click();

  const dialog = page.getByRole("dialog");
  const name = `viewer-check-${randomUUID()}.pdf`;
  await dialog.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: await readFile("public/sample/brieflock-sample.pdf"),
  });
  await dialog.getByRole("button", { name: "Upload document" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Open secure viewer" }).click();
  await expect(page.getByTitle(`Secure viewer for ${name}`)).toBeVisible();
  await expect(page.getByText("Secure document viewer ready", { exact: true })).toHaveCount(1);
});
