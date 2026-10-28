import { test, expect } from "@playwright/test";
import { gotoStage, waitForDemoMedia } from "./helpers";

test("calendar shows plans on the correct day in the selected timezone", async ({ page }) => {
  await page.goto("/calendar?view=agenda&d=2026-11-28");
  await page.getByRole("button", { name: "New plan" }).click();
  const dialog = page.getByRole("dialog", { name: "New publishing plan" });
  await dialog.getByLabel("Reel", { exact: true }).selectOption({ label: "Iced coffee – House Blend ✓ approved" });
  await dialog.getByLabel("Date", { exact: true }).fill("2026-11-30");
  await dialog.getByLabel("Time", { exact: true }).fill("23:30");
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByText("Plan created")).toBeVisible();

  // 23:30 in Bangkok on 30 Nov
  await page.goto("/calendar?view=agenda&d=2026-11-28");
  const bkk = page.getByRole("region", { name: /Monday 30 November/ }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: /Monday 30 November/ }) }));
  await expect(bkk.getByRole("button", { name: /Iced coffee/ })).toContainText("23:30");

  // Same instant in London (GMT+0) is 16:30 on 30 Nov
  await page.goto("/settings");
  await page.getByLabel("Timezone").selectOption("Europe/London");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.goto("/calendar?view=agenda&d=2026-11-28");
  await expect(page.getByText("London (GMT+0)").first()).toBeVisible();
  const lon = page.locator("section").filter({ has: page.getByRole("heading", { name: /Monday 30 November/ }) });
  await expect(lon.getByRole("button", { name: /Iced coffee/ })).toContainText("16:30");

  // Restore Bangkok
  await page.goto("/settings");
  await page.getByLabel("Timezone").selectOption("Asia/Bangkok");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
});

test("re-rendering an approved Reel requires approval again", async ({ page }) => {
  await page.goto("/");
  await waitForDemoMedia(page);
  await page.goto("/review/prj_iced_house_blend");
  await expect(page.getByText("Approved for this version")).toBeVisible();

  await page.goto("/create/prj_iced_house_blend");
  await gotoStage(page, "Review");
  await expect(page.getByText(/Rendering a new version clears the approval/)).toBeVisible();
  await page.getByRole("button", { name: /Render new version & send for review/ }).click();
  await expect(page.getByText(/Render v2 queued/)).toBeVisible();

  await page.goto("/review/prj_iced_house_blend");
  await expect(page.getByText("Approved for this version")).toHaveCount(0);
  await expect(page.getByText("Draft has not been approved")).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve draft" });
  await expect(approve).toBeEnabled({ timeout: 120_000 });

  // The plan that was "planned" now waits for approval
  await page.goto("/calendar?plan=pln_iced_1");
  await expect(page.getByText("Nothing will be sent to Facebook until the current video and caption are approved.").first()).toBeVisible();

  await page.goto("/review/prj_iced_house_blend");
  await approve.click();
  await expect(page.getByText("Approved for this version")).toBeVisible();
});
