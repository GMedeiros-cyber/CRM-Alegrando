/**
 * Decisão sobre o erro do insert da mensagem do cliente (api/webhooks/zapi).
 *
 * Vive aqui, fora do route.ts, para ser testável: é a regra que decide entre
 * seguir, tratar como duplicata e devolver 500 para a Z-API reenviar.
 *
 * - `null`  → "ok": gravou.
 * - `23505` → "duplicada": violação do índice único
 *   `messages_msgid_canal_unique` em `(metadata->>'messageId', canal)`, que
 *   existe em produção. Significa entrega concorrente — a linha já está lá,
 *   posta por outra execução do webhook. Não é erro: é o índice fazendo o
 *   trabalho dele.
 * - qualquer outro (ou erro sem `code`) → "falha": o webhook precisa responder
 *   500 para a Z-API reenviar, senão a mensagem se perde sem retentativa. O
 *   mesmo índice único garante que a reentrega não duplica.
 */
export function classificarErroInsert(
    error: { code?: string } | null,
): "ok" | "duplicada" | "falha" {
    if (!error) return "ok";
    if (error.code === "23505") return "duplicada";
    return "falha";
}
