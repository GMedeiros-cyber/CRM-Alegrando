import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        "DATABASE_URL não configurada. Adicione ao .env.local com a connection string do Supabase."
    );
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
