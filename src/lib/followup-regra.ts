/**
 * Em que dias o cron manda cada mensagem automática do pós-passeio.
 * `diffDias` = dias desde `ultimo_passeio` (0 = dia do passeio).
 */

/**
 * Dias DEPOIS do vencimento em que o follow-up ainda sai.
 *
 * Com igualdade exata (`diffDias === followupDias`), um dia ruim perdia o lead
 * para sempre: cron fora do ar, Z-API fora, ou a trava de 23h barrando no dia
 * do vencimento porque a equipe tinha acabado de conversar. Sem teto, sairia
 * mensagem com meses de atraso — em 13/10/2026 havia 3 leads presos com 34, 59
 * e 60 dias, e um "que tal o próximo passeio?" dois meses depois não serve.
 * Uma semana cobre o dia ruim sem ressuscitar o que já passou.
 */
export const FOLLOWUP_TOLERANCIA_DIAS = 7;

/** D+1, pedido de avaliação: só no dia exato — avaliação tardia não faz sentido. */
export function enviaAvaliacao(diffDias: number): boolean {
    return diffDias === 1;
}

/**
 * D+N, follow-up: do vencimento até `FOLLOWUP_TOLERANCIA_DIAS` depois, se ainda
 * não foi. `followupEnviado` é o que impede a repetição dentro da janela; a
 * consulta da rota já filtra por ele, e a regra confere de novo para não
 * depender disso.
 */
export function enviaFollowup(diffDias: number, followupDias: number, followupEnviado: boolean): boolean {
    if (followupEnviado) return false;
    return diffDias >= followupDias && diffDias <= followupDias + FOLLOWUP_TOLERANCIA_DIAS;
}
