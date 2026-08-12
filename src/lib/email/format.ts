/**
 * Helpers puros do envio de e-mail (usados no cliente e no servidor).
 */

import {
    EMAIL_FIELD_ORDER,
    type EmailFieldKey,
    type LinkDoCorpo,
    type TipoLinkCorpo,
} from "@/lib/types/email";

// Validação deliberadamente simples: pega erro de digitação (falta de @, espaço,
// domínio sem ponto) sem tentar implementar a RFC 5322 inteira.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
    return EMAIL_RE.test(value.trim());
}

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

/**
 * Converte o texto simples digitado pela equipe em HTML mínimo pro Gmail.
 *
 * O n8n não processa nada — manda o `body` cru como HTML. Então a conversão
 * precisa garantir que (a) nada que ela digitou vire tag e (b) as quebras de
 * linha sobrevivam.
 *
 * Linha em branco separa parágrafo (`<p>`), quebra simples vira `<br>`.
 */
export function plainTextToHtml(text: string): string {
    const escaped = text.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);

    return escaped
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0)
        .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
        .join("\n");
}

/**
 * As entidades nomeadas que aparecem de verdade em e-mail escrito em português.
 *
 * Não é a tabela HTML inteira de propósito — mas as acentuadas precisam estar:
 * cliente que escapa acento manda `Or&ccedil;amento`, e sem isto o nome de um
 * arquivo do Drive chegava na tela com o código cru no meio da palavra.
 */
const ENTIDADES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&aacute;": "á", "&agrave;": "à", "&acirc;": "â", "&atilde;": "ã", "&auml;": "ä",
    "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê", "&euml;": "ë",
    "&iacute;": "í", "&igrave;": "ì", "&icirc;": "î", "&iuml;": "ï",
    "&oacute;": "ó", "&ograve;": "ò", "&ocirc;": "ô", "&otilde;": "õ", "&ouml;": "ö",
    "&uacute;": "ú", "&ugrave;": "ù", "&ucirc;": "û", "&uuml;": "ü",
    "&ccedil;": "ç", "&ntilde;": "ñ",
    "&Aacute;": "Á", "&Agrave;": "À", "&Acirc;": "Â", "&Atilde;": "Ã",
    "&Eacute;": "É", "&Ecirc;": "Ê", "&Iacute;": "Í",
    "&Oacute;": "Ó", "&Ocirc;": "Ô", "&Otilde;": "Õ",
    "&Uacute;": "Ú", "&Ccedil;": "Ç",
    "&ordm;": "º", "&ordf;": "ª", "&deg;": "°",
    "&hellip;": "…", "&mdash;": "—", "&ndash;": "–",
    "&lsquo;": "‘", "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”",
    "&middot;": "·", "&bull;": "•",
    "&copy;": "©", "&reg;": "®", "&trade;": "™", "&euro;": "€",
};

/**
 * Decodifica entidades HTML, nomeadas e numéricas.
 *
 * As numéricas importam porque o Gmail usa `&#39;` na fonte da assinatura e
 * `&#8230;` na reticência de título truncado — sem isto o título de um arquivo
 * do Drive apareceria com o código cru no meio.
 */
function decodificarEntidades(texto: string): string {
    return texto
        .replace(/&#(\d+);/g, (bruto, dec: string) => {
            const ponto = Number(dec);
            return ponto > 0 && ponto <= 0x10ffff ? String.fromCodePoint(ponto) : bruto;
        })
        .replace(/&#x([0-9a-f]+);/gi, (bruto, hex: string) => {
            const ponto = parseInt(hex, 16);
            return ponto > 0 && ponto <= 0x10ffff ? String.fromCodePoint(ponto) : bruto;
        })
        // Caso exato ANTES do minúsculo: senão `&Ccedil;` cairia na chave
        // `&ccedil;` e "Conceição" viraria "conceição" no meio da palavra.
        .replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, (e) => ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? e);
}

/**
 * Reduz o HTML de uma resposta a texto puro.
 *
 * O corpo de uma resposta vem de FORA — é a escola que escreve. Renderizar
 * esse HTML no painel abriria uma porta de XSS por um caminho que não
 * controlamos, então o CRM mostra sempre o texto. `body_text` costuma existir
 * (todo cliente decente manda multipart), e isto aqui é o plano B.
 *
 * ATENÇÃO: esta conversão **descarta o `href`** das âncoras, de propósito (o
 * resultado é texto). Quem precisa do endereço usa `extrairLinksDoCorpo`, que
 * lê o mesmo HTML e devolve os links estruturados.
 */
export function htmlParaTexto(html: string): string {
    return decodificarEntidades(
        html
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
            .replace(/<[^>]+>/g, ""),
    )
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Marcadores do começo do histórico citado, aplicados sobre o texto inteiro.
 *
 * O primeiro aceita a linha de atribuição QUEBRADA. O Gmail enrola o corpo em
 * 78 colunas, então na prática ela chega assim:
 *
 *   Em ter., 11 de ago. de 2026 às 00:01, Silvana Gomes Moura <
 *   contato@alegrando.com.br> escreveu:
 *
 * Procurar "escreveu:" no fim da MESMA linha que começa com "Em" não acha
 * nada aí — era por isso que a atribuição sobrevivia ao corte e o histórico
 * do lead virava um paredão.
 */
const MARCADORES_CITACAO: RegExp[] = [
    /^[ \t]*(?:Em|On)\b[\s\S]{0,400}?\b(?:escreveu|wrote):[ \t]*\r?$/m,
    /^[ \t]*-{2,}\s*(?:Mensagem original|Mensagem encaminhada|Original Message|Forwarded message)/im,
    /^[ \t]*>/m,
];

/**
 * Separa o que a pessoa escreveu do histórico citado abaixo.
 *
 * Toda resposta arrasta a conversa inteira colada no fim, e isso piora a cada
 * troca: na terceira resposta o corpo carrega as duas anteriores aninhadas.
 *
 * Conservador de propósito: sem marcador reconhecido — ou com marcador logo no
 * caractere zero, que deixaria a resposta vazia — devolve o texto inteiro.
 * Citação a mais é bem menos ruim que resposta sumida.
 */
export function separarCitacao(texto: string): { principal: string; citacao: string } {
    let corte = -1;
    for (const marcador of MARCADORES_CITACAO) {
        const achado = marcador.exec(texto);
        if (achado && (corte === -1 || achado.index < corte)) corte = achado.index;
    }

    if (corte <= 0) return { principal: texto.trim(), citacao: "" };

    return {
        principal: texto.slice(0, corte).trim(),
        citacao: texto.slice(corte).trim(),
    };
}

/**
 * Corta o bloco citado do HTML antes de virar texto.
 *
 * É o caminho mais confiável quando o e-mail veio em HTML: o Gmail marca a
 * citação com `gmail_quote`, então não há adivinhação de marcador nenhuma.
 */
export function removerCitacaoHtml(html: string): string {
    const marcador = /<(?:div|blockquote)[^>]*class="[^"]*gmail_quote/i;
    const achado = marcador.exec(html);
    return achado && achado.index > 0 ? html.slice(0, achado.index) : html;
}

// =============================================================
// LINKS DO CORPO — o que a conversão pra texto joga fora
// =============================================================

/** Ícone do chip: `.../type/application/vnd.google-apps.spreadsheet`. */
const TIPO_POR_MIME: Record<string, TipoLinkCorpo> = {
    "vnd.google-apps.spreadsheet": "planilha",
    "vnd.google-apps.document": "documento",
    "vnd.google-apps.presentation": "apresentacao",
    "vnd.google-apps.form": "formulario",
    "vnd.google-apps.folder": "pasta",
};

/** Caminho da URL, quando o chip não trouxe ícone. */
const TIPO_POR_CAMINHO: [RegExp, TipoLinkCorpo][] = [
    [/\/spreadsheets\//i, "planilha"],
    [/\/document\//i, "documento"],
    [/\/presentation\//i, "apresentacao"],
    [/\/forms\//i, "formulario"],
    [/\/drive\/folders\//i, "pasta"],
];

const HOSTS_NUVEM = /(^|\.)(drive|docs)\.google\.com$/i;

/**
 * Valor de um atributo, com aspas duplas, simples ou sem aspas.
 *
 * O Gmail sempre usa aspas duplas, mas nem todo cliente de e-mail usa — e um
 * `href=https://…` que o extrator não enxerga é exatamente o tipo de perda
 * silenciosa que este projeto já pagou caro.
 */
function atributo(tagAberta: string, nome: string): string {
    const achado = new RegExp(
        `\\b${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
        "i",
    ).exec(tagAberta);
    if (!achado) return "";
    return decodificarEntidades(achado[1] ?? achado[2] ?? achado[3] ?? "");
}

/**
 * Só `http`/`https`, e absoluta.
 *
 * `javascript:`, `data:` e companhia morrem aqui — e morrem no SERVIDOR, antes
 * de o endereço chegar ao componente. `new URL` também normaliza, então não
 * sobra espaço pra truque de escrita.
 */
function urlSegura(bruto: string): string | null {
    try {
        const url = new URL(bruto.trim());
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function tipoDoLink(iconeSrc: string, url: string, nuvem: boolean): TipoLinkCorpo {
    for (const [mime, tipo] of Object.entries(TIPO_POR_MIME)) {
        if (iconeSrc.includes(mime)) return tipo;
    }
    if (/type\/application\/pdf/i.test(iconeSrc) || /\.pdf($|\?)/i.test(url)) return "pdf";
    for (const [padrao, tipo] of TIPO_POR_CAMINHO) {
        if (padrao.test(url)) return tipo;
    }
    return nuvem ? "arquivo" : "link";
}

const RE_ANCORA = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

/**
 * Tira do HTML do corpo os links que a conversão pra texto perde.
 *
 * Nasceu de um caso real: um lead respondeu inserindo dois arquivos pelo chip
 * do Drive. Chip do Drive **não é anexo** — é um bloco HTML no corpo, com o
 * `href` na âncora e o título num `<span>`. A conversão pra texto guarda o
 * título e joga o `href` fora, então na tela sobravam duas linhas de texto
 * morto. O autolink não resolvia porque não há URL nenhuma no texto pra linkar.
 *
 * Roda no SERVIDOR, sobre o `body_html` que já está gravado — por isso vale
 * retroativamente pras respostas antigas, sem migration e sem reprocessar nada.
 *
 * A citação sai antes: link que só existe no histórico citado não é link desta
 * mensagem, e viraria cartão repetido a cada resposta da thread.
 *
 * Detecta pelo endereço, e não pela classe `gmail_chip`: o marcador do Gmail
 * está no `<div>` de fora, não na âncora, e o teste por host cobre o mesmo caso
 * mais um — Drive colado como link comum, que também é arquivo na nuvem.
 */
export function extrairLinksDoCorpo(html: string | null | undefined): LinkDoCorpo[] {
    if (!html) return [];

    const corpo = removerCitacaoHtml(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
    const vistos = new Set<string>();
    const saida: LinkDoCorpo[] = [];

    RE_ANCORA.lastIndex = 0;
    let achado: RegExpExecArray | null;

    while ((achado = RE_ANCORA.exec(corpo)) !== null) {
        const [, atributos, interno] = achado;

        const url = urlSegura(atributo(atributos, "href"));
        if (!url || vistos.has(url)) continue;

        const iconeSrc = atributo(/<img\b[^>]*>/i.exec(interno)?.[0] ?? "", "src");
        const texto = decodificarEntidades(interno.replace(/<[^>]+>/g, "")).trim();
        const rotulo = atributo(atributos, "aria-label");

        let host = "";
        try {
            host = new URL(url).hostname;
        } catch {
            /* urlSegura já garantiu que dá pra parsear; guarda de paranoia */
        }
        const nuvem = HOSTS_NUVEM.test(host) || /vnd\.google-apps/i.test(iconeSrc);

        // Âncora cujo texto É o próprio endereço não perdeu nada na conversão —
        // o autolink já a reconstrói a partir do texto. Duplicar viraria link na
        // frase e cartão embaixo dizendo a mesma coisa.
        if (!nuvem && (texto === url || texto === url.replace(/\/$/, "") || !texto)) continue;

        vistos.add(url);
        saida.push({
            url,
            titulo: texto || rotulo || url,
            tipo: tipoDoLink(iconeSrc, url, nuvem),
            nuvem,
        });
    }

    return saida;
}

/**
 * Tira do texto as linhas que são só o título de um chip.
 *
 * Sem isto o título aparece duas vezes: uma como linha órfã (resto da conversão
 * pra texto) e outra dentro do cartão. Compara a LINHA INTEIRA, já aparada — um
 * título que por acaso apareça no meio de uma frase continua onde está.
 */
export function removerTitulosDeChip(texto: string, titulos: string[]): string {
    if (!texto || titulos.length === 0) return texto;

    const alvos = new Set(titulos.map((t) => t.trim()).filter(Boolean));
    if (alvos.size === 0) return texto;

    return texto
        .split("\n")
        .filter((linha) => !alvos.has(linha.trim()))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export type SegmentoTexto =
    | { tipo: "texto"; valor: string }
    | { tipo: "link"; valor: string; href: string };

const PADRAO_LINK =
    /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|[^\s<>@]+@[^\s<>@]+\.[a-z]{2,})/gi;

/**
 * Tira do fim da URL o que é pontuação da frase, não do endereço.
 *
 * "veja https://exemplo.com/doc." — o ponto é da frase. Parêntese e colchete
 * só saem quando estão desbalanceados, porque URL de Wikipédia e de Docs
 * legitimamente carrega os dois.
 */
function aparar(bruto: string): string {
    let url = bruto;
    while (url.length > 0) {
        const ultimo = url[url.length - 1];

        if (".,;:!?\"'".includes(ultimo)) {
            url = url.slice(0, -1);
            continue;
        }

        const par: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
        if (par[ultimo]) {
            const abre = par[ultimo];
            const abertos = url.split(abre).length - 1;
            const fechados = url.split(ultimo).length - 1;
            if (fechados > abertos) {
                url = url.slice(0, -1);
                continue;
            }
        }
        break;
    }
    return url;
}

function hrefDe(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (/^www\./i.test(url)) return `https://${url}`;
    return `mailto:${url}`;
}

/**
 * Quebra o texto em pedaços de texto puro e de link.
 *
 * Devolve dados, e não HTML, de propósito: o corpo vem de fora — é a escola
 * que escreve — e transformar isso em marcação abriria uma porta de XSS. Quem
 * renderiza monta nós React a partir daqui, então nada do remetente pode virar
 * tag.
 */
export function segmentarLinks(texto: string): SegmentoTexto[] {
    const saida: SegmentoTexto[] = [];
    let cursor = 0;

    PADRAO_LINK.lastIndex = 0;
    let achado: RegExpExecArray | null;

    while ((achado = PADRAO_LINK.exec(texto)) !== null) {
        const bruto = achado[0];
        const url = aparar(bruto);

        // Sobrou só pontuação: anda o cursor do regex pra não travar o laço.
        if (!url) {
            PADRAO_LINK.lastIndex = achado.index + bruto.length;
            continue;
        }

        if (achado.index > cursor) {
            saida.push({ tipo: "texto", valor: texto.slice(cursor, achado.index) });
        }
        saida.push({ tipo: "link", valor: url, href: hrefDe(url) });

        cursor = achado.index + url.length;
        PADRAO_LINK.lastIndex = cursor;
    }

    if (cursor < texto.length) {
        saida.push({ tipo: "texto", valor: texto.slice(cursor) });
    }
    return saida;
}

/** As colunas de e-mail de `Clientes _WhatsApp`, como vêm do Supabase. */
export type LeadEmailColumns = Record<EmailFieldKey, string | null>;

/** Extrai só os endereços preenchidos e com formato válido, por tipo. */
export function extractEmails(
    row: Partial<LeadEmailColumns>,
): Partial<Record<EmailFieldKey, string>> {
    const out: Partial<Record<EmailFieldKey, string>> = {};
    for (const key of EMAIL_FIELD_ORDER) {
        const raw = row[key];
        if (typeof raw !== "string") continue;
        const value = raw.trim();
        if (value && isValidEmail(value)) out[key] = value;
    }
    return out;
}

/**
 * Endereços de um lead para os tipos escolhidos, deduplicados.
 * O mesmo endereço pode estar em dois campos (ex: coordenadora == diretora).
 */
export function pickEmails(
    emails: Partial<Record<EmailFieldKey, string>>,
    fields: EmailFieldKey[],
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const key of EMAIL_FIELD_ORDER) {
        if (!fields.includes(key)) continue;
        const value = emails[key];
        if (!value) continue;
        const dedupeKey = value.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(value);
    }
    return out;
}
