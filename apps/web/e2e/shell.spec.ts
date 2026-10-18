import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.getByRole("link", { name: "Continue with Discord" }).click();
	await expect(page).toHaveURL(/\/servers\/?$/);
	await expect(page.getByRole("heading", { name: "Choose a server" })).toBeVisible();
}

test("login and member shell are keyboard complete and axe-clean", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Your server, one place" })).toBeVisible();
	await page.keyboard.press("Tab");
	await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("#main-content")).toBeFocused();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await signIn(page);
	await expect(page.getByText("Northstar", { exact: true })).toBeVisible();
	await expect(page.getByText("3 servers available")).toBeVisible();
	await expect(page.locator(".server-list li")).toHaveCount(3);
	await expect(page.getByText("Unconfigured Preview", { exact: true })).toHaveCount(0);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await page.getByRole("link", { name: "Open", exact: true }).first().click();
	await expect(page.getByRole("heading", { name: "Northstar" })).toBeVisible();
});

test("mobile selector has no horizontal overflow and keeps the account action", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await signIn(page);
	await expect(page.getByRole("navigation", { name: "Main navigation" }).last()).toBeVisible();
	await page.locator(".mobile-header details.account-menu summary").click();
	await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(overflow).toBe(false);
});

test("callback failures are announced and the shell remains useful at 200 percent zoom", async ({
	page,
}) => {
	await page.goto("/?authError=invalid_state");
	await expect(page.getByRole("alert")).toContainText("could not be verified");
	await page.setViewportSize({ width: 640, height: 450 });
	await expect(page.getByRole("link", { name: "Continue with Discord" })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(overflow).toBe(false);
});

test("reduced motion disables the loading shimmer", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/servers");
	const duration = await page
		.locator(".skeleton")
		.first()
		.evaluate((element) => getComputedStyle(element).animationDuration);
	expect(Number.parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1_000)).toBeLessThanOrEqual(
		0.01,
	);
});
