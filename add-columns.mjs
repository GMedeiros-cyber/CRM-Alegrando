import postgres from 'postgres';

const sql = postgres("postgresql://postgres.mtzlpogvcyhhjaagmlxn:Alegrando2013%40@aws-1-sa-east-1.pooler.supabase.com:5432/postgres");

async function run() {
    try {
        await sql`
            ALTER TABLE "Clientes _WhatsApp" 
            ADD COLUMN IF NOT EXISTS linkedin TEXT,
            ADD COLUMN IF NOT EXISTS facebook TEXT,
            ADD COLUMN IF NOT EXISTS instagram TEXT;
        `;
        console.log("Columns added successfully");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

run();
