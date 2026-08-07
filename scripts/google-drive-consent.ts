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
        const detalhe = (err as Error).message;
        // Mostra o motivo NA PÁGINA também: quem autoriza está olhando pro
        // navegador, não pro terminal — e um "erro" pelado não diz nada.
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" }).end(
            `<h1>Falhou na troca do código</h1><pre style="white-space:pre-wrap">${detalhe.replace(/</g, "&lt;")}</pre>` +
                `<p>O código de autorização já foi consumido — rode o script de novo e autorize outra vez.</p>`,
        );
        console.error(`\n❌ ${detalhe}`);
        console.error(
            "\nO código já foi consumido. Rode o script de novo e autorize novamente.",
        );
        process.exitCode = 1;
    } finally {
        server.close();
    }
});

// Porta ocupada normalmente é uma execução anterior deste mesmo script que
// ficou pendurada. Sem isto o Node cospe um stack trace de 'error' não
// tratado, que não diz o que fazer — e pior: a execução velha continua
// atendendo o callback, possivelmente com credenciais antigas em memória.
server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\n❌ A porta ${PORT} já está em uso.`);
        console.error(
            "Provavelmente há uma execução anterior deste script pendurada — ela vai\n" +
                "interceptar o consentimento com as credenciais que tinha ao subir.\n\n" +
                "Encerre antes de tentar de novo (PowerShell):\n" +
                `  Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ` +
                "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }",
        );
        process.exit(1);
    }
    console.error(`\n❌ Erro no servidor local: ${err.message}`);
    process.exit(1);
});

// Ctrl+C sem deixar a porta presa pra próxima execução.
process.on("SIGINT", () => {
    server.close();
    process.exit(130);
});

// As instruções só saem DEPOIS de a porta estar de fato nossa. Imprimir antes
// deixaria um link válido na tela num cenário em que o callback iria parar em
// outro processo.
server.listen(PORT, () => {
    // O prefixo numérico do client_id é o número do projeto GCP. Mostrar ajuda
    // a pegar na hora o caso de estar autorizando no projeto errado.
    console.log(`\nModo: ${arg} — ${modo.descricao}`);
    console.log(`Escopo: ${modo.scope}`);
    console.log(`Client: ${clientId} (projeto ${clientId.split("-")[0]})`);
    console.log("\n1. Confirme no Google Cloud Console que este redirect está autorizado:");
    console.log(`   ${REDIRECT_URI}`);
    console.log("\n2. Abra este link e autorize COM A CONTA DA ALEGRANDO:\n");
    console.log(authUrl);
    console.log("\nAguardando o consentimento...\n");
});
