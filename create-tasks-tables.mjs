import postgres from "postgres";

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

async function createTables() {
    try {
        console.log("Criando tabelas task_lists e task_cards...");

        await sql`
      CREATE TABLE IF NOT EXISTS "task_lists" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" text NOT NULL,
          "position" integer NOT NULL DEFAULT 0,
          "created_at" timestamp with time zone DEFAULT now()
      );
    `;
        console.log("Tabela task_lists OK!");

        await sql`
      CREATE TABLE IF NOT EXISTS "task_cards" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "list_id" uuid NOT NULL REFERENCES "task_lists"("id") ON DELETE CASCADE,
          "title" text NOT NULL,
          "description" text,
          "position" integer NOT NULL DEFAULT 0,
          "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
          "created_at" timestamp with time zone DEFAULT now()
      );
    `;
        console.log("Tabela task_cards OK!");

    } catch (err) {
        console.error("Erro na criação das tabelas:", err);
    } finally {
        process.exit(0);
    }
}

createTables();
