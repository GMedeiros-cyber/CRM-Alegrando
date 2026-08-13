/**
 * O único canal ativo do CRM.
 *
 * O negócio de festas foi encerrado em agosto/2026. **Os dados continuam no
 * banco** — 424 leads e 15.056 mensagens, 58% e 63% do total — e nada foi
 * apagado: o canal está apenas invisível na interface e filtrado nas consultas.
 *
 * Para reativar: devolver `"festas"` às listas de opção da interface e aos
 * seletores que foram removidos, e religar o webhook da Evolution. O caminho
 * de despacho por provedor (`lib/actions/messages.ts`, `lib/whatsapp/sender.ts`)
 * continua inteiro no código, sem uso.
 *
 * Existe como constante, e não como literal espalhado, exatamente para que essa
 * volta seja um lugar só.
 */
export const CANAL_ATIVO = "alegrando";

/**
 * Canal de uma consulta, com o ativo como piso.
 *
 * Nunca devolve nulo de propósito: consulta sem cláusula de canal traz os 424
 * leads de festas de volta para a tela. Era assim que o filtro "Todos"
 * funcionava, e é a regressão mais fácil de reintroduzir aqui.
 */
export function canalDaConsulta(pedido?: string | null): string {
    return pedido && pedido !== "todos" ? pedido : CANAL_ATIVO;
}
