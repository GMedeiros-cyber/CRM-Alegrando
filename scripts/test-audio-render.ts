/**
 * Teste manual: insere uma mensagem de áudio com URL pública no Supabase,
 * para que o usuário verifique visualmente o player HTML5 no chat.
 * Uso: npx tsx scripts/test-audio-render.ts
 *
 * NÃO apagar este script nem a mensagem inserida — o usuário valida no navegador.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SB_URL || !SB_SERVICE_KEY) {
    console.error("Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

const TEST_PHONE = "5512982450000";
const TEST_URL = "https://download.samplelib.com/mp3/sample-3s.mp3";

async function main() {
    const { data, error } = await supabase
        .from("messages")
        .insert({
            telefone: TEST_PHONE,
            sender_type: "cliente",
            sender_name: "TESTE Audio Render",
            content: TEST_URL,
            media_type: "audio",
        })
        .select("id")
        .single();

    if (error) {
        console.error("Erro ao inserir:", error.message);
        process.exit(1);
    }

    console.log("✓ Mensagem de áudio inserida com sucesso");
    console.log("  id:", data.id);
    console.log("  telefone:", TEST_PHONE);
    console.log("  url:", TEST_URL);
    console.log("");
    console.log("Abra /conversas no CRM, selecione o contato", TEST_PHONE);
    console.log("e confirme que o player <audio controls> aparece e reproduz o áudio.");
}

main();
