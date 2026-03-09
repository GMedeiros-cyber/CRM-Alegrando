const { Client } = require('pg');
const client = new Client({ connectionString: "postgresql://postgres.mtzlpogvcyhhjaagmlxn:Alegrando2013%40@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" });

async function run() {
    try {
        await client.connect();
        await client.query(`
            ALTER TABLE "Clientes _WhatsApp" 
            ADD COLUMN IF NOT EXISTS linkedin TEXT,
            ADD COLUMN IF NOT EXISTS facebook TEXT,
            ADD COLUMN IF NOT EXISTS instagram TEXT;
        `);
        console.log("Columns added successfully");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}
run();
