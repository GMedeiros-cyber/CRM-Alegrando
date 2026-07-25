import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";

/**
 * Client S3 do Cloudflare R2 + helpers de upload e dedup por hash.
 *
 * Usado para os uploads de mídia NÃO-áudio do WhatsApp (o que antes ia pro
 * bucket `documents` do Supabase). Áudio (bucket `audios`) e avatares continuam
 * no Supabase Storage.
 *
 * O segredo (`R2_SECRET_ACCESS_KEY`) vem SEMPRE de env var — nunca hardcoded.
 * O "Token value" (`cfat_...`) da Cloudflare NÃO é usado aqui: o client S3 usa
 * apenas Access Key ID + Secret Access Key + endpoint.
 */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "alegrando-media";
// Sem barra no final: a URL pública é montada como `${R2_PUBLIC_URL}/${path}`.
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true,
});

/** SHA-256 hex do conteúdo — base do dedup por hash. */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** URL pública de um objeto do R2 a partir do seu path/key. */
export function r2PublicUrl(path: string): string {
  return `${R2_PUBLIC_URL}/${path}`;
}

/**
 * Faz upload de um objeto no bucket R2 (`alegrando-media`) e retorna a URL
 * pública `${R2_PUBLIC_URL}/${path}`.
 */
export async function uploadToR2(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: path,
      Body: body,
      ContentType: contentType,
    }),
  );
  return r2PublicUrl(path);
}

/**
 * Verifica se um objeto já existe no R2 (HeadObject). Retorna `false` no 404
 * (não existe) — usado para o dedup por hash: se já existe, pula o upload.
 * Erros que não sejam 404 são propagados.
 */
export async function objectExistsInR2(path: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: path }),
    );
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status === 404 || (err as { name?: string })?.name === "NotFound") {
      return false;
    }
    throw err;
  }
}
