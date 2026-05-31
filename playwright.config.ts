import { defineConfig, devices } from "@playwright/test";

/**
 * Config de testes visuais/responsividade.
 * Sobe contra o dev server já rodando em localhost:3000.
 * Para autenticar nas telas internas (gated por Clerk), defina no ambiente:
 *   E2E_BASE_URL (default http://localhost:3000)
 *   E2E_EMAIL / E2E_PASSWORD  → credenciais de um usuário de teste do Clerk
 * Sem credenciais, apenas as rotas públicas (sign-in) são capturadas.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
