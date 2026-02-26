import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Carrega .env.local primeiro, depois .env como fallback
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
    out: "./drizzle",
    schema: "./src/lib/db/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },

    // ═══════════════════════════════════════════════════
    // ⚠️  SEGURANÇA MÁXIMA — PROTEÇÃO DE TABELAS EXTERNAS
    // ═══════════════════════════════════════════════════
    //
    // O Supabase contém tabelas de produção do n8n que o Drizzle
    // NÃO PODE tocar sob nenhuma hipótese.
    //
    // tablesFilter: restringe quais tabelas o Drizzle "enxerga".
    //   → Push/generate/pull SOMENTE afetam estas tabelas.
    //   → Tabelas fora da lista são COMPLETAMENTE INVISÍVEIS.
    //
    // strict: true → pede confirmação Y/N antes de qualquer ALTER/DROP.
    // verbose: true → mostra o SQL exato que será executado.
    //
    // Combinação tablesFilter + strict garante que:
    //   1. Drizzle nunca detecta tabelas externas (não tenta dropar)
    //   2. Mesmo nas nossas tabelas, pede confirmação para destructive changes
    //
    tablesFilter: [
        "users",
        "kanban_columns",
        "tags",
        "lead_tags",
        "transportadores",
        "leads",
        "messages",
        "agendamentos",
    ],

    // Schemas: operar SOMENTE no schema "public"
    // (ignora schemas internos como auth, storage, etc.)
    schemaFilter: ["public"],

    verbose: true,
    strict: true,
});
