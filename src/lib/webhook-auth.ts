import { timingSafeEqual } from "crypto";

/**
 * Compara duas strings em tempo constante para evitar timing attacks.
 * Retorna false se algum input for null/undefined ou tamanhos diferentes.
 */
function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

/**
 * Valida o Client-Token enviado pela Z-API nos webhooks.
 * A Z-API envia o token configurado no painel via header "Client-Token".
 * Confronta com ZAPI_CLIENT_TOKEN do ambiente.
 *
 * Retorna { ok: true } se válido, ou { ok: false, status, message } com a resposta a ser devolvida.
 */
export function verifyZapiWebhook(req: Request): { ok: true } | { ok: false; status: number; message: string } {
    if (process.env.WEBHOOK_AUTH_DISABLE === "true") {
        console.warn("[webhook-auth] AUTH Z-API DESATIVADA via WEBHOOK_AUTH_DISABLE (emergência)");
        return { ok: true };
    }
    const expected = process.env.ZAPI_CLIENT_TOKEN;
    if (!expected) {
        console.error("[webhook-auth] ZAPI_CLIENT_TOKEN não configurado — rejeitando todos os webhooks Z-API");
        return { ok: false, status: 500, message: "Webhook auth não configurado" };
    }
    const got = req.headers.get("client-token") ?? req.headers.get("Client-Token");
    if (!safeCompare(got?.trim() ?? null, expected.trim())) {
        console.warn(
            `[webhook-auth] ZAPI 401 | header_presente=${got !== null} | len_recebido=${got?.length ?? 0} | len_esperado=${expected.length} | prefix_recebido='${got?.slice(0,4) ?? "(none)"}' | prefix_esperado='${expected.slice(0,4)}' | headers_keys=${Array.from(req.headers.keys()).join(",")}`
        );
        return { ok: false, status: 401, message: "Token inválido" };
    }
    return { ok: true };
}

/**
 * Valida o apikey enviado pela Evolution API nos webhooks.
 * Confronta com EVOLUTION_API_KEY do ambiente.
 */
export function verifyEvolutionWebhook(req: Request): { ok: true } | { ok: false; status: number; message: string } {
    if (process.env.WEBHOOK_AUTH_DISABLE === "true") {
        console.warn("[webhook-auth] AUTH EVOLUTION DESATIVADA via WEBHOOK_AUTH_DISABLE (emergência)");
        return { ok: true };
    }
    const expected = process.env.EVOLUTION_API_KEY;
    if (!expected) {
        console.error("[webhook-auth] EVOLUTION_API_KEY não configurado — rejeitando todos os webhooks Evolution");
        return { ok: false, status: 500, message: "Webhook auth não configurado" };
    }
    const got = req.headers.get("apikey") ?? req.headers.get("Apikey");
    if (!safeCompare(got?.trim() ?? null, expected.trim())) {
        console.warn(
            `[webhook-auth] EVOLUTION 401 | header_presente=${got !== null} | len_recebido=${got?.length ?? 0} | len_esperado=${expected.length} | prefix_recebido='${got?.slice(0,4) ?? "(none)"}' | prefix_esperado='${expected.slice(0,4)}' | headers_keys=${Array.from(req.headers.keys()).join(",")}`
        );
        return { ok: false, status: 401, message: "Token inválido" };
    }
    return { ok: true };
}
