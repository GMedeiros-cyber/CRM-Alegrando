/**
 * Teste manual de envio de áudio via Z-API (canal alegrando).
 *
 * NÃO executar automaticamente — este script envia de verdade para o telefone
 * configurado. Rode apenas quando o usuário pedir explicitamente:
 *   npx tsx scripts/test-send-audio-zapi.ts
 *
 * Pré-requisitos:
 *   - .env.local com ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
 *   - Instância Z-API conectada
 *   - Variável TEST_PHONE abaixo preenchida com seu número pessoal
 *
 * Esse script usa uma URL pública de áudio (sample-3s.mp3) e dispara o endpoint
 * /send-audio diretamente — não passa pelo Supabase Storage nem pelas actions.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_PHONE = "5512982450000"; // troque pelo seu número real antes de rodar
const TEST_AUDIO_URL = "https://download.samplelib.com/mp3/sample-3s.mp3";

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    console.error("Faltando credenciais Z-API em .env.local");
    process.exit(1);
}

function formatPhone(tel: string): string {
    const digits = tel.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) return digits;
    return `55${digits}`;
}

async function main() {
    const phone = formatPhone(TEST_PHONE);
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-audio`;

    console.log("→ POST", url);
    console.log("  phone:", phone);
    console.log("  audio:", TEST_AUDIO_URL);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Client-Token": ZAPI_CLIENT_TOKEN!,
        },
        body: JSON.stringify({ phone, audio: TEST_AUDIO_URL }),
    });

    const body = await res.text();
    console.log("← status:", res.status);
    console.log("← body:", body);

    if (!res.ok) process.exit(1);
    console.log("✓ Enviado. Confirme no WhatsApp do número", TEST_PHONE);
}

main();
