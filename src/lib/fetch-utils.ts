/**
 * fetch com timeout enforced via AbortController.
 * Evita conexões penduradas se a API externa travar (Z-API, Evolution, n8n).
 *
 * Uso:
 *   const res = await fetchWithTimeout(url, { method: "POST", body }, 10_000);
 *
 * Erros:
 *  - Timeout estouro → DOMException name "TimeoutError" (AbortSignal.timeout)
 *  - Network → TypeError "fetch failed"
 *
 * Default: 10s. Para chamadas potencialmente lentas (uploads de áudio/imagem),
 * passe um valor maior explicitamente.
 */
export async function fetchWithTimeout(
    url: string | URL,
    init: RequestInit = {},
    timeoutMs: number = 10_000,
): Promise<Response> {
    return fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
    });
}
