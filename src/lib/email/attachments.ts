/**
 * Regras de anexo do e-mail: limites, tipos aceitos e classificação por ícone.
 *
 * Vale pros três caminhos de entrada (clipe, Drive e colar) — validar num só
 * lugar evita que um deles aceite o que os outros recusam.
 */

/**
 * Teto do Gmail por mensagem: 25MB somando TODOS os anexos, não por arquivo.
 * O aumento pra 50MB de fev/2026 valeu só pro Workspace Enterprise Plus.
 */
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/**
 * A partir daqui já avisa. O MIME encoda em Base64, que infla ~33%: uns 18MB
 * de arquivo real viram ~24MB na transmissão e encostam no teto — o envio pode
 * ser recusado pelo Gmail mesmo com a conta dentro do limite nominal.
 */
export const WARN_BYTES = 18 * 1024 * 1024;

/**
 * Por quanto tempo um anexo em trânsito ainda conta como **espera**.
 *
 * Passado isso, `attachments_pending` deixa de virar "Carregando…" na tela e
 * passa a ser lido como falha. É defesa em profundidade: no caminho normal
 * quem converte pendente em faltando é o próprio worker, e o UPDATE chega pelo
 * Realtime. Esta regra cobre o caso em que o worker não roda mais — instância
 * fora do ar, workflow desativado — e a bolha ficaria girando para sempre num
 * anexo que nunca vem. Sumiço silencioso trocado por mentira silenciosa.
 *
 * O GÊMEO desta constante vive no n8n, no Code node "Selecionar novas
 * respostas" do worker `NOAIuHJmIUh6Fdne`, como `JANELA_MIN`. São sistemas
 * diferentes e não há como importar uma na outra: **se mudar aqui, mude lá no
 * mesmo movimento.** Divergir abre uma janela em que a tela diz "falhou"
 * enquanto o worker ainda está tentando.
 */
export const JANELA_ANEXO_PENDENTE_MIN = 10;

/**
 * A conta roda no SERVIDOR de propósito: relógio de navegador adiantado
 * declararia falha cedo demais, e o erro seria invisível para quem depura.
 */
export function anexoPendenteVencido(createdAt: unknown): boolean {
    const nascida = Date.parse(String(createdAt ?? ""));
    if (!Number.isFinite(nascida)) return false;
    return Date.now() - nascida > JANELA_ANEXO_PENDENTE_MIN * 60_000;
}

/** Extensões que o Gmail bloqueia de qualquer jeito — barrar antes de subir. */
const EXTENSOES_BLOQUEADAS = new Set([
    "exe", "bat", "cmd", "com", "cpl", "dll", "scr", "pif", "msi", "msp", "msc",
    "jar", "js", "jse", "vbs", "vbe", "ws", "wsf", "wsh", "ps1", "ps1xml",
    "ps2", "psc1", "reg", "lnk", "inf", "hta", "app", "sh", "bash", "csh",
]);

/** O que o `accept` do input oferece — documentos do dia a dia. */
export const ACCEPT_ATTR = [
    "image/*",
    ".pdf",
    ".doc", ".docx",
    ".xls", ".xlsx",
    ".ppt", ".pptx",
    ".txt", ".csv",
    ".zip",
].join(",");

export function extensaoDe(nome: string): string {
    const partes = nome.toLowerCase().split(".");
    return partes.length > 1 ? partes[partes.length - 1] : "";
}

/** Motivo da recusa, ou null quando o arquivo pode ser anexado. */
export function motivoRecusa(file: { name: string; size: number }): string | null {
    const ext = extensaoDe(file.name);

    if (EXTENSOES_BLOQUEADAS.has(ext)) {
        return `"${file.name}" é um tipo que o Gmail bloqueia (.${ext}) — compacte em .zip se precisar enviar.`;
    }
    if (file.size === 0) {
        return `"${file.name}" está vazio.`;
    }
    if (file.size > MAX_TOTAL_BYTES) {
        return `"${file.name}" tem ${formatarBytes(file.size)} — sozinho já passa do limite de 25 MB do Gmail.`;
    }
    return null;
}

export function formatarBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Endereço que faz o navegador SALVAR o anexo em vez de abrir.
 *
 * Não dá pra apontar `<a download>` direto pro R2: o atributo é ignorado em URL
 * de outra origem, e o botão viraria só mais um "abrir em nova aba". A rota
 * `/api/anexos/download` é same-origin e devolve `Content-Disposition:
 * attachment` — ver o comentário lá pro porquê de ser proxy e não URL assinada.
 */
export function urlDeDownload(url: string, nome: string): string {
    return `/api/anexos/download?url=${encodeURIComponent(url)}&nome=${encodeURIComponent(nome)}`;
}

export type TipoAnexo =
    | "imagem"
    | "pdf"
    | "planilha"
    | "documento"
    | "apresentacao"
    | "compactado"
    | "texto"
    | "outro";

export function classificar(mimeType: string, nome: string): TipoAnexo {
    const mime = (mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) return "imagem";

    switch (extensaoDe(nome)) {
        case "pdf": return "pdf";
        case "xls": case "xlsx": case "csv": return "planilha";
        case "doc": case "docx": return "documento";
        case "ppt": case "pptx": return "apresentacao";
        case "zip": case "rar": case "7z": return "compactado";
        case "txt": return "texto";
        default:
            if (mime === "application/pdf") return "pdf";
            if (mime.startsWith("text/")) return "texto";
            return "outro";
    }
}
