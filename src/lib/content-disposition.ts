/**
 * `Content-Disposition` de download com nome acentuado (RFC 6266/5987):
 * `filename` em ASCII para navegador antigo e `filename*` percent-encoded com
 * o nome de verdade. O encode também impede injeção de cabeçalho por nome com
 * quebra de linha. (A rota de anexos tem uma cópia própria desta função.)
 */
export function contentDisposition(nome: string): string {
    const ascii = nome.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
