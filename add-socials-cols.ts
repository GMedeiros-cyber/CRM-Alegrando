import { db } from "./src/lib/db";
import { sql } from "drizzle-orm";

async function run() {
    try {
        await db.execute(sql`
            ALTER TABLE "Clientes _WhatsApp" 
            ADD COLUMN IF NOT EXISTS linkedin TEXT,
            ADD COLUMN IF NOT EXISTS facebook TEXT,
            ADD COLUMN IF NOT EXISTS instagram TEXT;
        `);
        console.log("Columns added successfully");
    } catch (e) {
        console.error("Error adding columns:", e);
    }
}
run();
