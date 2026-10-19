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

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

/** 'YYYY-MM-DD' de hoje em São Paulo, qualquer que seja o fuso do processo. */
export function diaEmSaoPaulo(agora: Date): string {
    return DIA_SP.format(agora);
}

/**
 * Dias desde o passeio (`ultimo_passeio`, coluna date 'YYYY-MM-DD'), com o
 * "hoje" de São Paulo. Antes era `setHours(0,0,0,0)` no fuso do processo: na
 * Vercel (UTC) um clique depois das 21h de Brasília já contava o dia
 * seguinte; no dev (Brasília) o passeio de ontem virava D+2.
 */
export function diasDesdeOPasseio(ultimoPasseio: string, agora: Date): number {
    const meiaNoiteUTC = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
    return Math.round((meiaNoiteUTC(diaEmSaoPaulo(agora)) - meiaNoiteUTC(ultimoPasseio)) / 86_400_000);
}
