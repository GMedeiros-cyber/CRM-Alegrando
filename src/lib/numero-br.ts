/**
 * Números digitados em pt-BR: ponto é milhar, vírgula é decimal, "R$" e
 * espaços são aceitos.
 *
 * Antes (contratos-bloco.tsx) "3.420" virava 3,42, "1.200 alunos" virava 1, e
 * "3.420,00" ou "R$ 90,00" viravam null — tudo calado, e o valor errado ia
 * para o contrato. Aqui o que não é número é RECUSADO (`ok: false`), nunca
 * transformado em null: null quer dizer "campo vazio", e só isso.
 *
 * Regra do ambíguo "90.5": um único ponto com 1 ou 2 dígitos depois é decimal
 * (90.5 = 90,50) — ninguém escreve milhar assim. Ponto com exatamente 3
 * dígitos depois é milhar (3.420 = 3420; 90.500 = 90500).
 */

export type Leitura = { ok: true; valor: number | null } | { ok: false };

const limpar = (t: string) => t.replace(/R\$/gi, "").replace(/[\s  ]/g, "");

const MILHAR = /^\d{1,3}(\.\d{3})+$/;

export function lerNumeroBR(texto: string): Leitura {
    const t = limpar(texto);
    if (t === "") return texto.trim() === "" ? { ok: true, valor: null } : { ok: false };
    const [inteira, decimal, ...resto] = t.split(",");
    if (resto.length) return { ok: false };
    if (decimal !== undefined && !/^\d+$/.test(decimal)) return { ok: false };
    let n: string;
    if (MILHAR.test(inteira)) n = inteira.replace(/\./g, "");
    else if (/^\d+$/.test(inteira)) n = inteira;
    else if (decimal === undefined && /^\d+\.\d{1,2}$/.test(inteira)) return { ok: true, valor: Number(inteira) };
    else return { ok: false };
    return { ok: true, valor: Number(decimal === undefined ? n : `${n}.${decimal}`) };
}

export function lerInteiroBR(texto: string): Leitura {
    const t = limpar(texto);
    if (t === "") return texto.trim() === "" ? { ok: true, valor: null } : { ok: false };
    if (MILHAR.test(t)) return { ok: true, valor: Number(t.replace(/\./g, "")) };
    if (/^\d+$/.test(t)) return { ok: true, valor: Number(t) };
    return { ok: false };
}

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "R$ 3.420,00" (com o espaço fino do Intl, que `lerNumeroBR` aceita de volta). */
export const formatarMoedaBR = (n: number) => MOEDA.format(n);
/** "1.200" */
export const formatarInteiroBR = (n: number) => INTEIRO.format(n);
