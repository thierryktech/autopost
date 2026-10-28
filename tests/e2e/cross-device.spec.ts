import { test, expect } from "@playwright/test";
import { IPAD, gotoStage } from "./helpers";

test("drafts and preferences sync between MacBook and iPad", async ({ browser }) => {
  const mac = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ipad = await browser.newContext(IPAD);
  const m = await mac.newPage();
  const i = await ipad.newPage();

  // Edit on the MacBook
  await m.goto("/create/prj_roasting_day");
  await gotoStage(m, "Thai copy");
  const caption = "คั่วกาแฟวันนี้ หอมไปทั้งร้าน ☕ (from MacBook)";
  await m.getByLabel("Thai caption").fill(caption);
  await expect(m.getByText("Saved", { exact: true })).toBeVisible();

  // Open on the iPad: same draft, same stage, compact tab layout
  await i.goto("/create/prj_roasting_day");
  await expect(i.getByRole("tablist", { name: "Workspace panels" })).toBeVisible();
  await i.getByRole("tab", { name: "Thai copy" }).click();
  await expect(i.getByLabel("Thai caption")).toHaveValue(caption);

  // Preference set on the iPad shows up on the MacBook
  await i.goto("/calendar");
  await i.getByRole("link", { name: "month" }).click();
  await expect(i).toHaveURL(/view=month/);
  await m.goto("/calendar");
  await expect(m.getByRole("link", { name: "month" })).toHaveAttribute("aria-current", "page");

  // Every interactive control on the iPad editor meets the 44px touch target
  await i.goto("/create/prj_roasting_day");
  const small = await i.evaluate(() =>
    [...document.querySelectorAll("main button, main a[href], main input:not([type=range]):not([type=file]), main select")]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ el: (el as HTMLElement).outerHTML.slice(0, 80), r: el.getBoundingClientRect() }))
      .filter((x) => x.r.height < 43.5 || (x.r.width < 43.5 && x.el.startsWith("<button")))
      .map((x) => x.el),
  );
  expect(small, `Controls under 44px: ${small.join("\n")}`).toEqual([]);

  await mac.close();
  await ipad.close();
});
