/**
 * Script one-shot: backfill de FOTOS e NOMES na tabela "Clientes _WhatsApp" do
 * projeto Supabase NOVO, buscando os dados atuais na origem (Z-API / Evolution)
 * sem esperar o lead mandar mensagem.
 *
 * URGENTE: rodar antes de desprovisionar o projeto Supabase ANTIGO — as fotos
 * cujo foto_url ainda aponta pro antigo vão sumir quando ele for deletado.
 *
 * Fases (--only, default "tudo"):
 *   fotos-quebradas  → foto_url aponta pro Supabase antigo (mtzlpogv...) → refetch
 *   fotos-faltando   → foto_url null/vazio → busca foto atual
 *   nomes            → nome null/vazio/numérico → preenche com pushName real
 *   tudo             → as três, nessa ordem
 *
 * Uso:
 *   npm run backfill:fotos-nomes -- --dry-run                 (RODAR PRIMEIRO)
 *   npm run backfill:fotos-nomes -- --dry-run --only=nomes
 *   npm run backfill:fotos-nomes -- --only=fotos-quebradas    (live)
 *   npm run backfill:fotos-nomes                              (live, tudo)
 *
 * --dry-run: NÃO escreve no banco nem sobe nada no Storage. Chama as APIs de
 * canal (read-only) pra reportar cobertura real do que seria feito.
 *
 * Fotos regravadas vão pro bucket `avatars` do Supabase NOVO (via
 * proxyPhotoToStorage). Nomes: 1º tenta messages.sender_name (pushName já
 * recebido); 2º fallback na API do canal. Nunca sobrescreve nome real existente.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { proxyPhotoToStorage } from "../src/lib/whatsapp/photo-storage";

config({ path: ".env.local" });

// ---------- flags ----------
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "tudo";
const VALID_ONLY = ["fotos-quebradas", "fotos-faltando", "nomes", "tudo"] as const;
type Phase = "fotos-quebradas" | "fotos-faltando" | "nomes";
if (!VALID_ONLY.includes(ONLY as (typeof VALID_ONLY)[number])) {
  console.error(`--only inválido: "${ONLY}". Use: ${VALID_ONLY.join(" | ")}`);
  process.exit(1);
}

const BATCH_SIZE = 20;
const ITEM_DELAY_MS = 250;
const BATCH_DELAY_MS = 1200;

// ---------- env ----------
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const EVO_URL = process.env.EVOLUTION_API_URL;
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE;
const EVO_KEY = process.env.EVOLUTION_API_KEY;

const NEW_REF = "aymdpooolgwfeczzepmq";
const OLD_REF = "mtzlpogvcyhhjaagmlxn";

if (!SB_URL || !SB_SERVICE_KEY) {
  console.error("Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
// Guard: nunca rodar contra o projeto antigo por engano.
if (SB_URL.includes(OLD_REF)) {
  console.error(
    `⛔ .env.local aponta pro projeto ANTIGO (${OLD_REF}). Atualize NEXT_PUBLIC_SUPABASE_URL e ` +
      `SUPABASE_SERVICE_ROLE_KEY pro projeto novo (${NEW_REF}) antes de rodar o backfill.`,
  );
  process.exit(1);
}

const supabase = createClient(SB_URL, SB_SERVICE_KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Z-API/Evolution devolvem STRING "null"/"undefined" em vários campos — filtrar.
function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t === "null" || t === "undefined") return null;
  return t;
}

const GENERIC_NAMES = new Set([
  "cliente",
  "equipe",
  "alegrando",
  "marcia",
  "márcia",
  "festas",
  "grupo whatsapp",
]);

function isRealName(v: string | null | undefined): boolean {
  const t = clean(v ?? null);
  if (!t) return false;
  if (/^[0-9]+$/.test(t)) return false; // só dígitos
  if (GENERIC_NAMES.has(t.toLowerCase())) return false;
  return true;
}

function normalizePhone(tel: string): string {
  if (tel.endsWith("-group")) return tel; // grupos: id exato (tratados por backfill:grupos)
  const d = tel.replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

// ---------- fetchers de FOTO (read-only) ----------
async function fetchPicZapi(phone: string): Promise<string | null> {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) return null;
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/profile-picture?phone=${phone}`;
  try {
    const res = await fetch(url, { headers: { "Client-Token": ZAPI_CLIENT_TOKEN } });
    if (!res.ok) return null;
    const body = (await res.json()) as { link?: string };
    const link = clean(body.link);
    return link && link.startsWith("http") ? link : null;
  } catch {
    return null;
  }
}

async function fetchPicEvolution(phone: string): Promise<string | null> {
  if (!EVO_URL || !EVO_INSTANCE || !EVO_KEY) return null;
  try {
    const res = await fetch(`${EVO_URL}/chat/fetchProfilePictureUrl/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ number: phone }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { profilePictureUrl?: string };
    const link = clean(body.profilePictureUrl);
    return link && link.startsWith("http") ? link : null;
  } catch {
    return null;
  }
}

function fetchPic(canal: string, phone: string): Promise<string | null> {
  return canal === "festas" ? fetchPicEvolution(phone) : fetchPicZapi(phone);
}

// ---------- fontes de NOME ----------
// Fonte 1 (confiável): pushName já recebido, gravado em messages.sender_name.
async function nameFromMessages(telefone: string): Promise<string | null> {
  const { data } = await supabase
    .from("messages")
    .select("sender_name")
    .eq("telefone", telefone)
    .eq("sender_type", "cliente")
    .not("sender_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  for (const row of (data ?? []) as { sender_name: string | null }[]) {
    if (isRealName(row.sender_name)) return clean(row.sender_name);
  }
  return null;
}

// Fonte 2 (best-effort): API do canal. Shape incerto → parse defensivo + log cru
// da 1ª resposta no dry-run pra confirmar os campos antes do run real.
let rawZapiNameLogged = false;
async function fetchNameZapi(phone: string): Promise<string | null> {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) return null;
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/contacts/${phone}`;
  try {
    const res = await fetch(url, { headers: { "Client-Token": ZAPI_CLIENT_TOKEN } });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    if (DRY_RUN && !rawZapiNameLogged) {
      rawZapiNameLogged = true;
      console.log("   [raw Z-API /contacts]", JSON.stringify(d).slice(0, 400));
    }
    const name = clean(d.name) ?? clean(d.short) ?? clean(d.vname) ?? clean(d.notify);
    return isRealName(name) ? name : null;
  } catch {
    return null;
  }
}

let rawEvoNameLogged = false;
async function fetchNameEvolution(phone: string): Promise<string | null> {
  if (!EVO_URL || !EVO_INSTANCE || !EVO_KEY) return null;
  try {
    const res = await fetch(`${EVO_URL}/chat/fetchProfile/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({ number: phone }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    if (DRY_RUN && !rawEvoNameLogged) {
      rawEvoNameLogged = true;
      console.log("   [raw Evolution /chat/fetchProfile]", JSON.stringify(d).slice(0, 400));
    }
    const name = clean(d.name) ?? clean(d.pushName) ?? clean(d.verifiedName);
    return isRealName(name) ? name : null;
  } catch {
    return null;
  }
}

// ---------- dados ----------
interface LeadRow {
  id: string;
  telefone: string;
  nome: string | null;
  canal: string | null;
  foto_url: string | null;
}

async function loadAllLeads(): Promise<LeadRow[]> {
  const all: LeadRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("Clientes _WhatsApp")
      .select("id, telefone, nome, canal, foto_url")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("Erro ao carregar leads:", error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as LeadRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function inBatches<T>(
  items: T[],
  fn: (item: T, idx: number, total: number) => Promise<void>,
): Promise<void> {
  const total = items.length;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    for (let j = 0; j < batch.length; j++) {
      await fn(batch[j], i + j + 1, total);
      await sleep(ITEM_DELAY_MS);
    }
    if (i + BATCH_SIZE < total) {
      console.log(
        `   … lote ${Math.floor(i / BATCH_SIZE) + 1} ok (${Math.min(i + BATCH_SIZE, total)}/${total}) — pausa`,
      );
      await sleep(BATCH_DELAY_MS);
    }
  }
}

function canalOf(lead: LeadRow): string {
  return lead.canal === "festas" ? "festas" : "alegrando";
}

// ---------- fases de FOTO ----------
async function processFotos(leads: LeadRow[], label: string) {
  let regravadas = 0,
    semFoto = 0,
    grupos = 0,
    erros = 0;
  await inBatches(leads, async (lead, idx, total) => {
    const tel = String(lead.telefone);
    const canal = canalOf(lead);
    if (tel.endsWith("-group")) {
      grupos++;
      return; // grupos são tratados por `npm run backfill:grupos`
    }
    const picUrl = await fetchPic(canal, normalizePhone(tel));
    if (!picUrl) {
      semFoto++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — sem foto disponível`);
      return;
    }
    if (DRY_RUN) {
      regravadas++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — DRY: regravaria de ${picUrl.slice(0, 55)}…`);
      return;
    }
    const stored = await proxyPhotoToStorage(supabase, picUrl, tel).catch(() => null);
    if (!stored) {
      erros++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — ✗ falha no proxy/upload`);
      return;
    }
    const { error } = await supabase
      .from("Clientes _WhatsApp")
      .update({ foto_url: stored })
      .eq("id", lead.id);
    if (error) {
      erros++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — ✗ erro update: ${error.message}`);
      return;
    }
    regravadas++;
    console.log(`  [${idx}/${total}] ${canal} ${tel} — ✅ foto regravada`);
  });
  console.log(
    `\n[${label}] ${DRY_RUN ? "regravaria" : "regravadas"}=${regravadas} · sem_foto=${semFoto} · grupos_pulados=${grupos} · erros=${erros}`,
  );
  return { alvos: leads.length, regravadas, semFoto, grupos, erros };
}

// ---------- fase de NOME ----------
async function processNomes(leads: LeadRow[]) {
  let viaMessages = 0,
    viaApi = 0,
    semNome = 0,
    grupos = 0,
    erros = 0;
  await inBatches(leads, async (lead, idx, total) => {
    const tel = String(lead.telefone);
    const canal = canalOf(lead);
    if (tel.endsWith("-group")) {
      grupos++;
      return;
    }
    let nome = await nameFromMessages(tel);
    let fonte = "messages";
    if (!nome) {
      nome = canal === "festas"
        ? await fetchNameEvolution(normalizePhone(tel))
        : await fetchNameZapi(normalizePhone(tel));
      fonte = "api";
    }
    if (!nome) {
      semNome++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — sem nome disponível`);
      return;
    }
    if (DRY_RUN) {
      if (fonte === "messages") viaMessages++;
      else viaApi++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — DRY: nome="${nome}" (${fonte})`);
      return;
    }
    const { error } = await supabase
      .from("Clientes _WhatsApp")
      .update({ nome })
      .eq("id", lead.id);
    if (error) {
      erros++;
      console.log(`  [${idx}/${total}] ${canal} ${tel} — ✗ erro update: ${error.message}`);
      return;
    }
    if (fonte === "messages") viaMessages++;
    else viaApi++;
    console.log(`  [${idx}/${total}] ${canal} ${tel} — ✅ nome="${nome}" (${fonte})`);
  });
  console.log(
    `\n[nomes] via_messages=${viaMessages} · via_api=${viaApi} · sem_nome=${semNome} · grupos_pulados=${grupos} · erros=${erros}`,
  );
  return { alvos: leads.length, viaMessages, viaApi, semNome, grupos, erros };
}

// ---------- main ----------
function targetLeads(all: LeadRow[], phase: Phase): LeadRow[] {
  if (phase === "fotos-quebradas") return all.filter((l) => l.foto_url?.includes(OLD_REF));
  if (phase === "fotos-faltando") return all.filter((l) => !l.foto_url || String(l.foto_url).trim() === "");
  return all.filter((l) => !isRealName(l.nome)); // nomes
}

async function main() {
  console.log("================= backfill-fotos-nomes =================");
  console.log(`MODE:   ${DRY_RUN ? "DRY-RUN (não escreve nada)" : "LIVE (escreve no banco/storage)"}`);
  console.log(`--only: ${ONLY}`);
  console.log(`Alvo:   ${SB_URL} ${SB_URL.includes(NEW_REF) ? "(projeto NOVO ✓)" : "(⚠️ ref inesperado)"}`);
  console.log(
    `APIs:   Z-API=${ZAPI_INSTANCE ? "ok" : "AUSENTE"} · Evolution=${EVO_URL ? "ok" : "AUSENTE"}`,
  );

  const all = await loadAllLeads();
  console.log(`Leads carregados: ${all.length}\n`);

  const phases: Phase[] = ONLY === "tudo" ? ["fotos-quebradas", "fotos-faltando", "nomes"] : [ONLY as Phase];
  const summary: Record<string, unknown> = {};

  for (const phase of phases) {
    const leads = targetLeads(all, phase);
    console.log(`\n########## ${phase.toUpperCase()} (${leads.length}) ##########`);
    summary[phase] =
      phase === "nomes" ? await processNomes(leads) : await processFotos(leads, phase);
  }

  console.log("\n===================== RESUMO =====================");
  console.log(JSON.stringify(summary, null, 2));
  console.log(DRY_RUN ? "\n(DRY-RUN — nada foi escrito)" : "\n(LIVE — alterações aplicadas)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
