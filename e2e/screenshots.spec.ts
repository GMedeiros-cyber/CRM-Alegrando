import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Captura screenshots de cada rota nos 3 viewports (definidos como projects no
 * playwright.config.ts) e detecta overflow horizontal — o sintoma clássico de
 * quebra de responsividade no mobile.
 *
 * Rotas internas exigem login no Clerk. Se E2E_EMAIL/E2E_PASSWORD estiverem no
 * ambiente, o teste faz login antes; senão, só /sign-in é capturada.
 */

const ROUTES = [
  { path: "/sign-in", name: "sign-in", public: true },
  { path: "/dashboard", name: "dashboard", public: false },
  { path: "/conversas", name: "conversas", public: false },
  { path: "/agenda", name: "agenda", public: false },
  { path: "/kanban", name: "kanban", public: false },
  { path: "/tarefas", name: "tarefas", public: false },
  { path: "/configuracoes", name: "configuracoes", public: false },
];

const OUT_DIR = path.join(process.cwd(), "e2e", "__screenshots__");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const AUTHED = Boolean(EMAIL && PASSWORD);

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function clerkLogin(page: Page) {
  await page.goto("/sign-in");
  // Clerk hosted components — best-effort selectors.
  const emailField = page.locator('input[name="identifier"], input[type="email"]').first();
  await emailField.waitFor({ state: "visible", timeout: 15000 });
  await emailField.fill(EMAIL!);
  await page.getByRole("button", { name: /continue|continuar/i }).first().click().catch(() => {});
  const pwField = page.locator('input[name="password"], input[type="password"]').first();
  await pwField.waitFor({ state: "visible", timeout: 15000 });
  await pwField.fill(PASSWORD!);
  await page.getByRole("button", { name: /continue|continuar|sign in|entrar/i }).first().click().catch(() => {});
  await page.waitForURL(/\/dashboard|\/conversas|\/$/, { timeout: 20000 }).catch(() => {});
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

test.describe("viewport screenshots + overflow check", () => {
  test("capture routes", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const width = page.viewportSize()?.width ?? 0;

    if (AUTHED) {
      await clerkLogin(page);
    }

    const report: string[] = [];
    for (const route of ROUTES) {
      if (!route.public && !AUTHED) continue;
      // Next dev mantém websockets de HMR abertos → "networkidle" nunca dispara.
      // domcontentloaded + settle curto é o correto aqui.
      await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(600);
      const file = path.join(OUT_DIR, `${route.name}__${project}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const overflow = await horizontalOverflow(page);
      report.push(`${route.name} @${width}px overflow=${overflow}px ${overflow > 1 ? "❌ OVERFLOW" : "✅"}`);
      // Overflow horizontal > 1px indica quebra de layout no viewport.
      expect(overflow, `${route.name} @${width}px has ${overflow}px horizontal overflow`).toBeLessThanOrEqual(1);
    }
    fs.appendFileSync(
      path.join(OUT_DIR, "_overflow-report.txt"),
      `\n[${project}] authed=${AUTHED}\n` + report.join("\n") + "\n"
    );
  });
});
