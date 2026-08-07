/**
 * Gera um refresh_token do Google para o CRM.
 *
 * Roda um servidor local só pra capturar o `code` do consentimento e trocá-lo
 * pelo refresh_token, que é impresso no terminal pra você colar no .env.local.
 *
 * Uso:
 *   npx tsx scripts/google-drive-consent.ts            → Drive (padrão)
 *   npx tsx scripts/google-drive-consent.ts drive      → GOOGLE_DRIVE_REFRESH_TOKEN
 *   npx tsx scripts/google-drive-consent.ts calendar   → GOOGLE_REFRESH_TOKEN
 *
 * Calendar e Drive usam o MESMO client OAuth mas guardam refresh tokens
 * SEPARADOS: assim revogar ou reemitir um não derruba o outro. Rode o script
 * uma vez para cada escopo.
 *
 * Pré-requisito: o redirect abaixo precisa estar na lista de "URIs de
 * redirecionamento autorizados" do OAuth Client no Google Cloud Console —
 * e desse mesmo client precisam sair o GOOGLE_CLIENT_ID e o
 * GOOGLE_CLIENT_SECRET que estão no .env.local.
 */
import { createServer } from "node:http";
import { config } from "dotenv";

config({ path: ".env.local" });

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

/**
 * O Calendar é read/write de propósito: agenda.ts faz events.insert, patch e
 * delete, então `calendar.readonly` não serviria. O Drive é só leitura — o CRM
 * apenas lista e baixa arquivos pra anexar.
 */
const MODOS = {
    drive: {
        scope: "https://www.googleapis.com/auth/drive.readonly",
        envVar: "GOOGLE_DRIVE_REFRESH_TOKEN",
        descricao: "leitura do Google Drive (anexos de e-mail)",
    },
    calendar: {
        scope: "https://www.googleapis.com/auth/calendar",
        envVar: "GOOGLE_REFRESH_TOKEN",
        descricao: "Google Calendar (agenda: criar, editar e excluir eventos)",
    },
} as const;

type Modo = keyof typeof MODOS;

const arg = (process.argv[2] || "drive").toLowerCase();
if (!(arg in MODOS)) {
    console.error(
        `Modo inválido: "${arg}". Use um de: ${Object.keys(MODOS).join(", ")}.`,
    );
    process.exit(1);
}
const modo = MODOS[arg as Modo];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error("Faltam GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no .env.local");
    process.exit(1);
}

const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: modo.scope,
        access_type: "offline",
        prompt: "consent",
    });

// O prefixo numérico do client_id é o número do projeto GCP. Mostrar ajuda a
// pegar na hora o caso de estar autorizando no projeto errado.
console.log(`\nModo: ${arg} — ${modo.descricao}`);
console.log(`Escopo: ${modo.scope}`);
console.log(`Client: ${clientId} (projeto ${clientId.split("-")[0]})`);
console.log("\n1. Confirme no Google Cloud Console que este redirect está autorizado:");
console.log(`   ${REDIRECT_URI}`);
console.log("\n2. Abra este link e autorize COM A CONTA DA ALEGRANDO:\n");
console.log(authUrl);
console.log("\nAguardando o consentimento...\n");

const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
    }

    const error = url.searchParams.get("error");
    if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
            .end(`<h1>Falhou: ${error}</h1><p>Pode fechar esta aba.</p>`);
        console.error(`\n❌ Consentimento negado: ${error}`);
        server.close();
        process.exit(1);
    }

    const code = url.searchParams.get("code");
    if (!code) {
        res.writeHead(400).end("sem code");
        return;
    }

    try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });
        const data = await tokenRes.json();

        if (!data.refresh_token) {
            throw new Error(
                `Google não devolveu refresh_token. Resposta: ${JSON.stringify(data)}`,
            );
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
            "<h1>Pronto!</h1><p>Pode fechar esta aba e voltar pro terminal.</p>",
        );

        console.log("✅ Token gerado. Cole no .env.local (e na Vercel):\n");
        console.log(`${modo.envVar}=${data.refresh_token}\n`);
        console.log(`escopos concedidos: ${data.scope}`);
    } catch (err) {
        res.writeHead(500).end("erro");
        console.error(`\n❌ ${(err as Error).message}`);
        process.exitCode = 1;
    } finally {
        server.close();
    }
});

server.listen(PORT);
