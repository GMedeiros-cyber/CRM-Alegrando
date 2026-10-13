/**
 * Status do contrato, fora do módulo de actions de propósito: arquivo com
 * `"use server"` só pode exportar função async, e exportar este array de lá
 * derruba o render com "A 'use server' file can only export async functions,
 * found object" — erro que o `next build` compila sem reclamar e só aparece
 * em tempo de execução.
 */
export const STATUS_CONTRATO = ["rascunho", "enviado", "assinado"] as const;
export type StatusContrato = (typeof STATUS_CONTRATO)[number];
