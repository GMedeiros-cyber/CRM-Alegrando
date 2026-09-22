/**
 * Respostas rápidas — o que é puro e roda no cliente: tipo, filtro do menu
 * da "/" e substituição de placeholders. A action (server) fica em
 * lib/actions/respostas-rapidas.ts.
 */

export type RespostaRapida = {
    id: string;
    /** Com a barra, como se digita: "/apresentacao". */
    atalho: string;
    titulo: string;
    conteudo: string;
    ordem: number;
    ativo: boolean;
};

/** Valores dos placeholders. `undefined`/vazio deixa o placeholder LITERAL na caixa. */
export type ValoresPlaceholder = {
    nome?: string | null;
    atendente?: string | null;
};

/**
 * Substitui {nome} e {atendente}. Sem valor, o placeholder fica como está:
 * texto pronto com "{nome}" à vista é uma falha visível, e é isso que se quer —
 * a atendente revisa antes de mandar; um espaço em branco passaria batido.
 */
export function aplicarPlaceholders(conteudo: string, valores: ValoresPlaceholder): string {
    const nome = valores.nome?.trim();
    const atendente = valores.atendente?.trim();
    return conteudo
        .replace(/\{nome\}/g, nome || "{nome}")
        .replace(/\{atendente\}/g, atendente || "{atendente}");
}

/** Primeira palavra do nome do lead — "Olá Maria", não "Olá Escola Municipal Pedro II". */
export function primeiroNome(nome: string | null | undefined): string {
    return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Filtra pelo que vem depois da "/": casa no atalho (sem a barra) ou no título,
 * sem acento e sem caixa. Query vazia = todas as ativas, na ordem.
 */
export function filtrarRespostas(respostas: RespostaRapida[], query: string): RespostaRapida[] {
    const q = normalizar(query);
    return respostas
        .filter(r => r.ativo)
        .filter(r => !q || normalizar(r.atalho.slice(1)).includes(q) || normalizar(r.titulo).includes(q))
        .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

function normalizar(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Check mínimo — `npx tsx src/lib/respostas-rapidas.ts`. */
function __selfCheck() {
    console.assert(aplicarPlaceholders("Oi {nome}, sou {atendente}.", { nome: "Maria", atendente: "Ana" }) === "Oi Maria, sou Ana.");
    console.assert(aplicarPlaceholders("Oi {nome}", { nome: "" }) === "Oi {nome}", "sem valor fica literal");
    console.assert(aplicarPlaceholders("{nome} {nome}", { nome: "X" }) === "X X", "todas as ocorrências");
    console.assert(primeiroNome("  Escola Municipal Pedro II ") === "Escola");
    console.assert(primeiroNome(null) === "");
    const base = (atalho: string, titulo: string, ordem = 0, ativo = true): RespostaRapida =>
        ({ id: atalho, atalho, titulo, conteudo: "", ordem, ativo });
    const lista = [base("/seguranca", "Segurança", 2), base("/onibus", "Ônibus e vans", 1), base("/velha", "Velha", 0, false)];
    console.assert(filtrarRespostas(lista, "").map(r => r.atalho).join() === "/onibus,/seguranca", "ordem e inativas fora");
    console.assert(filtrarRespostas(lista, "segur").length === 1, "por atalho");
    console.assert(filtrarRespostas(lista, "ônibus")[0]?.atalho === "/onibus", "por título, sem acento");
    console.assert(filtrarRespostas(lista, "velha").length === 0, "inativa não aparece");
    console.log("ok — respostas rápidas");
}
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("respostas-rapidas.ts")) __selfCheck();
