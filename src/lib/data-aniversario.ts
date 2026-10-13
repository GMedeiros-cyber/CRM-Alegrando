/**
 * Data de aniversário digitada como dd/mm/aaaa, gravada como ISO (coluna `date`).
 *
 * Funções puras, sem date-fns: o que se precisa é máscara, ida e volta do ISO
 * e "esse dia existe?" — o `Date.UTC` responde o último sozinho.
 */

/** Ano mais antigo aceito; o dropdown de ano do calendário começa aqui também. */
export const ANO_MINIMO = 1940;

/** Só dígitos, até 8, com as barras entrando conforme os dígitos chegam. */
export function mascararData(entrada: string): string {
    const d = entrada.replace(/\D/g, "").slice(0, 8);
    if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return d;
}

/** 'YYYY-MM-DD' do banco → 'dd/mm/aaaa' da tela. */
export function isoParaTexto(iso: string | null): string {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
}

export type LeituraData =
    | { tipo: "vazio" }
    | { tipo: "incompleta" }
    | { tipo: "invalida"; motivo: string }
    | { tipo: "ok"; iso: string };

/** Lê o texto mascarado. `hoje` em ISO: data depois dele é inválida. */
export function lerData(texto: string, hoje: string): LeituraData {
    if (texto === "") return { tipo: "vazio" };
    // Ano obrigatório: sem os 4 dígitos do ano não há data.
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) return { tipo: "incompleta" };
    const [d, m, a] = texto.split("/").map(Number);
    const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
    if (m < 1 || m > 12 || d < 1 || d > diasNoMes) {
        return { tipo: "invalida", motivo: `${texto} não existe.` };
    }
    const iso = `${texto.slice(6)}-${texto.slice(3, 5)}-${texto.slice(0, 2)}`;
    if (a < ANO_MINIMO || iso > hoje) {
        return { tipo: "invalida", motivo: `Use uma data entre ${ANO_MINIMO} e hoje.` };
    }
    return { tipo: "ok", iso };
}

/** Hoje no relógio de quem usa a tela, como ISO. */
export function hojeIso(): string {
    return dataParaIso(new Date());
}

/** Date local (o que o calendário entrega) → ISO, sem passar por UTC. */
export function dataParaIso(dia: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dia.getFullYear()}-${p(dia.getMonth() + 1)}-${p(dia.getDate())}`;
}
