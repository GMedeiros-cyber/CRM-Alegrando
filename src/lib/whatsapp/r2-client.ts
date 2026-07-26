import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";

/**
 * Client S3 do Cloudflare R2 + helpers de upload, dedup por hash e presigned URL.
 *
 * Usado tanto pelo fluxo de RECEBIMENTO de mídia (webhooks, media-storage.ts)
 * quanto pelo de ENVIO pela equipe (actions/messages.ts) — helper único, sem
 * duplicar lógica de upload. Só o bucket `avatars` (fotos de perfil) continua no
 * Supabase Storage.
 *
 * O segredo (`R2_SECRET_ACCESS_KEY`) vem SEMPRE de env var — nunca hardcoded.
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
 * Faz upload de um objeto no bucket R2 e retorna a URL pública.
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
 * Verifica se um objeto já existe no R2 (HeadObject) — usado só como OTIMIZAÇÃO
 * de dedup. NUNCA lança: qualquer erro (404, 403 de token write-only, rede…) é
 * tratado como "não existe", pra o upload sempre poder seguir. No 404 é silencioso
 * (caso normal); nos demais loga um warning.
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
    const name = (err as { name?: string })?.name;
    if (status === 404 || name === "NotFound" || name === "NotFoundError") {
      return false; // objeto não existe — caso normal do dedup
    }
    // 403 (token sem permissão Read), rede, etc.: não pode bloquear o upload.
    console.warn(
      `[R2] HeadObject falhou para ${path} (${name ?? status ?? "erro"}) — seguindo pro upload sem dedup.`,
    );
    return false;
  }
}

/**
 * Upload de mídia pro R2 com dedup GLOBAL por hash de conteúdo. Helper ÚNICO
 * compartilhado entre recebimento e envio.
 *
 * Path determinístico pelo SHA-256 (`shared/<hash>.<ext>`): arquivos idênticos —
 * mesmo de telefones diferentes — colidem no mesmo objeto (1 cópia só no R2). Se
 * já existe, pula o PutObject e retorna a URL existente. O dedup é otimização:
 * `objectExistsInR2` nunca bloqueia o upload.
 */
export async function putMediaDeduped(
  buffer: Buffer,
  ext: string,
  contentType: string,
): Promise<{ publicUrl: string; path: string }> {
  const path = `shared/${sha256(buffer)}.${ext}`;
  if (await objectExistsInR2(path)) {
    return { publicUrl: r2PublicUrl(path), path };
  }
  const publicUrl = await uploadToR2(path, buffer, contentType);
  return { publicUrl, path };
}

/** Apaga um objeto do R2 pelo path/key (usado ao deletar mensagem de áudio). */
export async function deleteFromR2(path: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: path }),
  );
}

/**
 * Gera uma URL presigned de PUT pro R2, pra upload direto do browser (arquivos
 * grandes que não cabem no body da server action). O browser precisa mandar o
 * mesmo `Content-Type` que foi assinado aqui, senão o R2 rejeita a assinatura.
 *
 * Requer CORS configurado no bucket R2 permitindo PUT da origem do CRM.
 */
export async function presignedPutUrl(
  path: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: path,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}
