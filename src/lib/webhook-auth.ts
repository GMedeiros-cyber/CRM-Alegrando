import { timingSafeEqual } from "crypto";

/**
 * Verificação de segredo dos webhooks.
 *
 * **Não existe interruptor para desligar isto.** Havia um
 * (`WEBHOOK_AUTH_DISABLE === "true"`), pensado como válvula de emergência, e ele
 * foi removido: ficou 94 dias parado em produção e o risco real nunca foi o uso
 * legítimo — era alguém encontrar a variável, achar que é depuração e ligá-la,
 * deixando os webhooks aceitarem qualquer chamada sem nada na tela avisando.
 * São quatro pessoas e o webhook quase nunca é depurado; a válvula custava mais
 * do que valia. Se um dia for preciso mesmo, o caminho é um deploy — visível e
 * revertível — e não uma variável de ambiente.
 */

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
 * Nomes de header que a Z-API já usou para mandar o token.
 *
 * São DOIS porque a Z-API trocou `Client-Token` por `z-api-token` sem aviso, em
 * 12/08/2026 — e o webhook passou a devolver 401 para tudo. O provedor
 * simplesmente desistiu de reenviar, e a ingestão ficou 43 horas parada sem
 * ninguém perceber: envio continuava funcionando, então a tela parecia viva.
 *
 * Aceitar os dois, e não trocar de um para o outro: não se sabe se a mudança é
 * permanente, e manter o nome antigo custa uma linha.
 *
 * Sem variantes com maiúscula — `Headers.get` é case-insensitive por
 * especificação, então `"Client-Token"` ao lado de `"client-token"` nunca
 * chegou a fazer nada.
 */
const HEADERS_TOKEN_ZAPI = ["client-token", "z-api-token"] as const;

/**
 * ⚠️ TEMPORÁRIO — REDUZIR A UMA SÓ ASSIM QUE O LOG DISSER QUAL É.
 *
 * A Z-API manda no header um valor de 24 caracteres começando com `FF7E`, que
 * NÃO é o Client-Token da conta (34 caracteres, começa com `Fdf`). O painel
 * deles não mostra qual credencial vai no webhook, e inspeção manual não
 * convergiu em três tentativas.
 *
 * Então o código descobre em vez de perguntar: aceita qualquer uma das três
 * credenciais que já temos e **registra qual casou**. Uma rodada depois disso,
 * esta lista some e fica só a certa, com nome próprio.
 *
 * Não afrouxa a segurança de forma relevante — as três são segredos que só a
 * Z-API e nós conhecemos, e tudo fora da lista continua levando 401. É
 * estritamente melhor que hoje, com a ingestão morta.
 */
const CREDENCIAIS_ZAPI = [
    { nome: "client-token", env: "ZAPI_CLIENT_TOKEN" },
    { nome: "instance-token", env: "ZAPI_TOKEN" },
    { nome: "instance-id", env: "ZAPI_INSTANCE" },
] as const;

/**
 * Valida o token enviado pela Z-API nos webhooks.
 *
 * Retorna { ok: true } se válido, ou { ok: false, status, message } com a resposta a ser devolvida.
 */
export function verifyZapiWebhook(req: Request): { ok: true } | { ok: false; status: number; message: string } {
    const candidatas: { nome: string; valor: string }[] = [];
    for (const c of CREDENCIAIS_ZAPI) {
        const valor = process.env[c.env]?.trim();
        if (valor) candidatas.push({ nome: c.nome, valor });
    }

    if (candidatas.length === 0) {
        console.error(
            "[webhook-auth] nenhuma credencial Z-API configurada (ZAPI_CLIENT_TOKEN, ZAPI_TOKEN, ZAPI_INSTANCE) — rejeitando todos os webhooks",
        );
        return { ok: false, status: 500, message: "Webhook auth não configurado" };
    }

    const got = HEADERS_TOKEN_ZAPI.reduce<string | null>(
        (achado, nome) => achado ?? req.headers.get(nome),
        null,
    );
    const recebido = got?.trim() ?? null;

    // Percorre TODAS mesmo depois de achar: sair no primeiro acerto faria o
    // tempo de resposta variar conforme a posição da credencial na lista, que é
    // exatamente o que a comparação de tempo constante existe para evitar.
    const casou = candidatas.reduce<string | null>(
        (achado, c) => (safeCompare(recebido, c.valor) ? c.nome : achado),
        null,
    );

    if (casou) {
        // É este log que fecha a investigação — diz qual credencial a Z-API
        // resolveu usar, sem imprimir segredo nenhum.
        console.log(`[webhook-auth] ZAPI ok | credencial=${casou}`);
        return { ok: true };
    }

    // Sem `prefix_esperado`: imprimir os 4 primeiros caracteres do segredo
    // que NÓS guardamos entrega meio caminho a quem lê o log. O prefixo do
    // RECEBIDO fica, porque é dado de quem chamou e é o que responde a
    // pergunta útil na depuração — "veio token errado ou token nenhum?".
    console.warn(
        `[webhook-auth] ZAPI 401 | header_presente=${got !== null} | len_recebido=${recebido?.length ?? 0} | len_esperado=${candidatas.map((c) => `${c.nome}:${c.valor.length}`).join("/")} | prefix_recebido='${recebido?.slice(0, 4) ?? "(none)"}' | headers_keys=${Array.from(req.headers.keys()).join(",")}`,
    );
    return { ok: false, status: 401, message: "Token inválido" };
}

/** Mesmo padrão do Z-API: uma lista, sem variante de caixa. */
const HEADERS_TOKEN_EVOLUTION = ["apikey"] as const;

/**
 * Valida o apikey enviado pela Evolution API nos webhooks.
 * Confronta com EVOLUTION_API_KEY do ambiente.
 */
export function verifyEvolutionWebhook(req: Request): { ok: true } | { ok: false; status: number; message: string } {
    const expected = process.env.EVOLUTION_API_KEY;
    if (!expected) {
        console.error("[webhook-auth] EVOLUTION_API_KEY não configurado — rejeitando todos os webhooks Evolution");
        return { ok: false, status: 500, message: "Webhook auth não configurado" };
    }
    const got = HEADERS_TOKEN_EVOLUTION.reduce<string | null>(
        (achado, nome) => achado ?? req.headers.get(nome),
        null,
    );
    if (!safeCompare(got?.trim() ?? null, expected.trim())) {
        console.warn(
            `[webhook-auth] EVOLUTION 401 | header_presente=${got !== null} | len_recebido=${got?.length ?? 0} | len_esperado=${expected.length} | prefix_recebido='${got?.slice(0,4) ?? "(none)"}' | headers_keys=${Array.from(req.headers.keys()).join(",")}`
        );
        return { ok: false, status: 401, message: "Token inválido" };
    }
    return { ok: true };
}
