/**
 * Hora de Brasília para o cron, sem depender do TZ do processo.
 *
 * O follow-up comparava `followup_hora` (que a equipe preenche em horário de
 * Brasília) com `new Date().getHours()` — que na Vercel é UTC. Com '09:00' a
 * janela só abria entre 08:01 e 09:59 UTC, horário em que o cron nem roda:
 * nada saía. Na máquina de quem desenvolve (TZ de Brasília) a conta fechava,
 * e por isso o defeito nunca apareceu localmente.
 *
 * Intl com `timeZone` explícito, e não um "-3" fixo: o fuso é do sistema de
 * fusos, não deste arquivo.
 */
const RELOGIO_SP = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    // h23: com hour12:false alguns motores escrevem meia-noite como "24".
    hourCycle: "h23",
});

/** Minutos desde a meia-noite em São Paulo, no instante `agora`. */
export function minutosEmSaoPaulo(agora: Date): number {
    const partes = RELOGIO_SP.formatToParts(agora);
    const valor = (tipo: "hour" | "minute") => Number(partes.find((p) => p.type === tipo)?.value);
    return valor("hour") * 60 + valor("minute");
}

/**
 * `agora` está a até 59 min de `hora` ('HH:MM' ou 'HH:MM:SS', Brasília)?
 * 60 já é fora: com as execuções em hora cheia, cada horário cai numa só.
 */
export function dentroDaJanelaFollowup(hora: string, agora: Date): boolean {
    const [h, m] = hora.split(":").map(Number);
    return Math.abs(minutosEmSaoPaulo(agora) - (h * 60 + m)) <= 59;
}

const DATA_EXTENSO_SP = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
});

/** "19 de outubro de 2026" — o dia de São Paulo, mesmo quando o UTC já virou. */
export function dataPorExtensoEmSaoPaulo(agora: Date): string {
    return DATA_EXTENSO_SP.format(agora);
}
