/**
 * Perfis de campo do lead, decididos pelas tags.
 *
 * Módulo de DADOS: mudar o que um perfil mostra é editar a tabela `PERFIS`
 * abaixo, num arquivo só. O painel lê o perfil e esconde seções; não há
 * condição de tag espalhada pelo JSX.
 *
 * ESCONDER NÃO APAGA. O perfil decide o que a tela mostra, nada mais. O dado
 * continua no banco: 14 dos 69 transportadores têm CNPJ gravado (medido em
 * 13/10/2026), e nenhum `UPDATE` deste projeto deve limpar campo escondido.
 */

export type PerfilLead = "escola" | "transportador" | "parceiro";

export type DefinicaoPerfil = {
    rotulo: string;
    /** Qual documento do LEAD o painel mostra. Transportador é pessoa física. */
    documento: "cnpj" | "cpf";
    /**
     * Bloco "Dados Institucionais": e-mail da instituição, os contatos de
     * Coordenadora e Diretora (nome, telefone, e-mail, CPF de cada) e as datas
     * de aniversário delas. As datas vivem DENTRO deste bloco, então não têm
     * chave própria: um flag separado seria sempre igual a este e divergiria
     * no primeiro ajuste distraído.
     */
    blocoInstituicao: boolean;
    /** Bloco de contratos do lead. */
    contratos: boolean;
};

export const PERFIS: Record<PerfilLead, DefinicaoPerfil> = {
    // O padrão: exatamente o que o painel mostrava antes dos perfis existirem.
    escola: {
        rotulo: "Escola",
        documento: "cnpj",
        blocoInstituicao: true,
        contratos: true,
    },
    // Pessoa física que transporta: não tem instituição, diretora nem contrato.
    transportador: {
        rotulo: "Transportador escolar",
        documento: "cpf",
        blocoInstituicao: false,
        contratos: false,
    },
    // Pode ser empresa, então CNPJ — mas não é escola: sem instituição nem contrato.
    parceiro: {
        rotulo: "Parceiro",
        documento: "cnpj",
        blocoInstituicao: false,
        contratos: false,
    },
};

/**
 * Tag → perfil, pelo NOME normalizado.
 *
 * Por nome e não por UUID porque apagar e recriar a tag troca o UUID e mataria
 * o perfil em silêncio. Normalizado porque a base tem nome com espaço duplo —
 * medido em 13/10/2026: `GUARULHOS  - PARTICULAR`, `MAIRIPORÃ  - PÚBLICA`,
 * `POÁ  PÚBLICA`, `SUZANO -  PARTICULAR`. As duas tags de perfil estão limpas
 * hoje, mas quem recriar uma digitando dois espaços não deve perder o perfil.
 *
 * UUIDs atuais, só para rastreio (NÃO são usados na decisão):
 *   TRANSPORTADOR ESCOLAR  c4ab3b28-1815-4c48-b5c3-f0ad435a185e  (69 leads)
 *   PARCEIROS              7b1caa99-aad5-45c1-9285-217ed99476cf  (32 leads)
 */
const TAG_PERFIL: ReadonlyArray<{ nome: string; perfil: PerfilLead }> = [
    { nome: "TRANSPORTADOR ESCOLAR", perfil: "transportador" },
    { nome: "PARCEIROS", perfil: "parceiro" },
];

/**
 * Precedência EXPLÍCITA, do mais restritivo ao menos. Não emerge da ordem do
 * array de tags do lead nem da ordem de `TAG_PERFIL`: o lead com as duas tags
 * tem de cair sempre no mesmo perfil, não no que o banco devolveu primeiro.
 * (Medido: hoje nenhum lead tem as duas — a regra é para quando tiver.)
 */
const PRECEDENCIA: ReadonlyArray<PerfilLead> = ["transportador", "parceiro", "escola"];

/** trim + maiúsculas + espaços múltiplos colapsados em um. */
export function normalizarNomeTag(nome: string): string {
    return nome.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Perfil do lead a partir das tags atribuídas. Sem tag de perfil (ou com tag
 * desconhecida) → `escola`, que é o padrão e o comportamento de antes.
 */
export function perfilDoLead(tags: ReadonlyArray<{ name: string }> | null | undefined): PerfilLead {
    const nomes = new Set((tags ?? []).map((t) => normalizarNomeTag(t.name)));
    const encontrados = new Set(
        TAG_PERFIL.filter((t) => nomes.has(normalizarNomeTag(t.nome))).map((t) => t.perfil),
    );
    return PRECEDENCIA.find((p) => encontrados.has(p)) ?? "escola";
}

/** Atalho: a definição do perfil do lead, para o painel ler direto. */
export function definicaoDoLead(tags: ReadonlyArray<{ name: string }> | null | undefined): DefinicaoPerfil {
    return PERFIS[perfilDoLead(tags)];
}

export type CampoDocumento = "cpf" | "cnpj";

/**
 * Tem valor = não-nulo E não-string-vazia.
 *
 * Os dois contam como vazio desde já. Hoje não existe `''` em `cpf`/`cnpj`
 * nas tags de perfil (medido: 0), mas vai existir: input controlado gravando
 * campo limpo escreve `''`, não `null`, e nem todo caminho de escrita passa
 * pelo `|| null` da tela.
 */
export function temValor(v: string | null | undefined): boolean {
    return typeof v === "string" && v.trim() !== "";
}

/**
 * Quais campos de documento o painel renderiza, na ordem.
 *
 * Nos perfis reduzidos o documento tem duas partes:
 *   - PRIMÁRIO, sempre visível e editável (`cpf` no transportador, `cnpj` no
 *     parceiro). É onde dado novo entra, sempre.
 *   - FALLBACK, o outro campo, visível SÓ quando já tem valor. Também
 *     editável, nunca read-only.
 *
 * O fallback SE CURA, e isso é o desenho, não bug: medido em 13/10/2026, 14
 * dos 69 transportadores têm só CNPJ e 12 têm só CPF (nenhum tem os dois).
 * O operador move o número para o campo certo, limpa o antigo e salva — no
 * próximo render o campo antigo não existe mais, porque deixou de ter valor.
 * Sem migration de dados e sem campo travado em read-only.
 *
 * `escola` não entra nessa regra: segue mostrando só `cnpj` no nível do lead,
 * exatamente como antes dos perfis existirem (o `cpf` do lead continua fora da
 * tela, e os CPFs que aparecem ali são `coordenadora_cpf` e `diretora_cpf`).
 */
export function camposDocumento(
    perfil: PerfilLead,
    valores: { cpf?: string | null; cnpj?: string | null },
): CampoDocumento[] {
    if (perfil === "escola") return ["cnpj"];
    const primario = PERFIS[perfil].documento;
    const fallback: CampoDocumento = primario === "cpf" ? "cnpj" : "cpf";
    return temValor(valores[fallback]) ? [primario, fallback] : [primario];
}
