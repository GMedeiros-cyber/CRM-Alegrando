"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// =============================================
// TIPOS
// =============================================

export type Passeio = {
    id: number;
    nome: string;
    tipo_passeio: string | null;
    categoria: string | null;
    content: string;
    temEmbedding: boolean;
};

export type PasseioForm = {
    nome: string;
    categoria: string;
    content: string;
};

export type Categoria = {
    slug: string;
    nome: string;
    icone: string;
};

const CATEGORIAS_DEFAULT: Categoria[] = [
    { slug: "estudos_do_meio", nome: "Estudos do Meio", icone: "🌿" },
    { slug: "historia_e_cultura", nome: "História e Cultura", icone: "🏛️" },
    { slug: "natureza", nome: "Natureza e Ecologia", icone: "🌲" },
    { slug: "gastronomia", nome: "Gastronomia", icone: "🍽️" },
    { slug: "artes", nome: "Artes e Cultura", icone: "🎨" },
    { slug: "outro", nome: "Outro", icone: "📍" },
];

function extractTitle(content: string): string {
    const m = content.replace(/\r\n/g, "\n").match(/^#\s+(.+)$/m);
    return m?.[1]?.trim() || "(sem título)";
}

function ensureTitle(nome: string, content: string): string {
    const text = content.replace(/\r\n/g, "\n").trim();
    if (/^#\s+/.test(text)) return text;
    return `# ${nome.trim()}\n\n${text}`;
}

// =============================================
// EMBEDDING (OpenAI)
// =============================================

async function generateEmbedding(content: string): Promise<number[] | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn("[documents] OPENAI_API_KEY ausente — passeio salvo sem embedding (n8n irá gerar depois)");
        return null;
    }

    try {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "text-embedding-ada-002",
                input: content,
            }),
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[documents] OpenAI ${res.status}: ${errBody}`);
            return null;
        }

        const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
        return json.data?.[0]?.embedding ?? null;
    } catch (err) {
        console.error("[documents] Falha ao gerar embedding:", err);
        return null;
    }
}

// =============================================
// CONVERSÃO TEXTO/PDF/IMAGEM → MARKDOWN (GPT-4o)
// =============================================

export type MarkdownInput = {
    nome: string;
    text?: string;
    fileBase64?: string;
    fileMimeType?: string;
    fileName?: string;
};

const MARKDOWN_SYSTEM_PROMPT = `Você é um especialista em estruturar conteúdo de passeios escolares pedagógicos em Markdown.

Você receberá texto, PDF ou imagem com informações de UM passeio e deve devolver APENAS Markdown no formato exato abaixo, sem comentários extras antes ou depois:

# [Nome do passeio]

## Descrição
[Descrição geral, propósito pedagógico, faixa etária, objetivos]

## Roteiro
- [Atividade ou local visitado 1]
- [Atividade 2]
- ...

## Cardápio
[Descrição das refeições, se houver — almoço, lanche, etc.]

## Pacote
- [Item incluso 1, ex: Transporte executivo]
- [Item 2, ex: Seguro viagem]
- ...

## Valores
- [Preço por aluno: R$ X,XX]
- [Outras condições, mín./máx. de pagantes, cortesias]

REGRAS IMPORTANTES:
- Mantenha TODA a informação relevante encontrada (não resuma demais)
- Use bullets em Roteiro e Pacote
- Se uma seção não tem informação, OMITA-A inteiramente (não invente)
- Se houver outras seções relevantes (ex: Acompanhantes, Observações, Faixa etária específica), inclua-as como "## NomeDaSecao" mantendo o padrão
- Português do Brasil, profissional mas acessível
- NÃO inclua preâmbulo, introdução nem explicações fora do Markdown
- O título (# ...) deve ser EXATAMENTE: "{NOME}" (use o nome fornecido pelo usuário)`;

export async function convertToMarkdown(
    input: MarkdownInput
): Promise<{ success: boolean; markdown?: string; error?: string }> {
    await requireAuth();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return { success: false, error: "OPENAI_API_KEY não configurada no servidor." };
    }

    if (!input.nome.trim()) {
        return { success: false, error: "Nome do passeio é obrigatório." };
    }

    const hasText = !!input.text?.trim();
    const hasFile = !!input.fileBase64 && !!input.fileMimeType;
    if (!hasText && !hasFile) {
        return { success: false, error: "Forneça texto OU um arquivo (PDF/imagem)." };
    }

    const systemPrompt = MARKDOWN_SYSTEM_PROMPT.replace("{NOME}", input.nome.trim());

    const userContent: Array<Record<string, unknown>> = [];

    if (hasText) {
        userContent.push({
            type: "text",
            text: `Conteúdo do passeio "${input.nome.trim()}":\n\n${input.text!.trim()}`,
        });
    }

    if (hasFile) {
        const dataUri = `data:${input.fileMimeType};base64,${input.fileBase64}`;
        if (input.fileMimeType === "application/pdf") {
            userContent.push({
                type: "file",
                file: {
                    file_data: dataUri,
                    filename: input.fileName || "passeio.pdf",
                },
            });
            userContent.push({
                type: "text",
                text: `Estruture este PDF do passeio "${input.nome.trim()}" no Markdown padrão.`,
            });
        } else if (input.fileMimeType?.startsWith("image/")) {
            userContent.push({
                type: "image_url",
                image_url: { url: dataUri },
            });
            userContent.push({
                type: "text",
                text: `Estruture esta imagem do passeio "${input.nome.trim()}" no Markdown padrão.`,
            });
        } else {
            return { success: false, error: `Tipo de arquivo não suportado: ${input.fileMimeType}` };
        }
    }

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o",
                temperature: 0.2,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent },
                ],
            }),
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[convertToMarkdown] OpenAI ${res.status}: ${errBody}`);
            return { success: false, error: `OpenAI ${res.status}: ${errBody.slice(0, 300)}` };
        }

        const json = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const markdown = json.choices?.[0]?.message?.content?.trim();
        if (!markdown) {
            return { success: false, error: "Resposta vazia do modelo." };
        }

        const cleaned = markdown
            .replace(/^```markdown\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();

        return { success: true, markdown: cleaned };
    } catch (err) {
        console.error("[convertToMarkdown] Falha:", err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// =============================================
// PASSEIOS — CRUD
// =============================================

export async function getPasseios(): Promise<Passeio[]> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
        .from("documents")
        .select("id, tipo_passeio, categoria, content, embedding")
        .order("id", { ascending: true });

    if (error) {
        console.error("[getPasseios]", error.message);
        return [];
    }

    return (data ?? []).map((row) => ({
        id: row.id as number,
        nome: row.tipo_passeio || extractTitle(row.content as string),
        tipo_passeio: row.tipo_passeio as string | null,
        categoria: row.categoria as string | null,
        content: row.content as string,
        temEmbedding: row.embedding != null,
    }));
}

export async function createPasseio(
    form: PasseioForm
): Promise<{ success: boolean; id?: number; error?: string; embeddingGerado?: boolean }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    if (!form.nome.trim()) return { success: false, error: "Nome do passeio é obrigatório." };
    if (!form.content.trim()) return { success: false, error: "Conteúdo do passeio é obrigatório." };

    const content = ensureTitle(form.nome, form.content);
    const embedding = await generateEmbedding(content);

    const insertRow: Record<string, unknown> = {
        content,
        tipo_passeio: form.nome.trim(),
        categoria: form.categoria || "outro",
        metadata: { nome: form.nome.trim(), categoria: form.categoria || "outro" },
    };
    if (embedding) insertRow.embedding = embedding;

    const { data, error } = await supabase
        .from("documents")
        .insert(insertRow)
        .select("id")
        .single();

    if (error) {
        console.error("[createPasseio]", error.message);
        return { success: false, error: error.message };
    }

    revalidatePath("/configuracoes");
    return { success: true, id: data.id as number, embeddingGerado: !!embedding };
}

export async function updatePasseio(
    id: number,
    form: PasseioForm
): Promise<{ success: boolean; error?: string; embeddingGerado?: boolean }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    if (!form.nome.trim()) return { success: false, error: "Nome do passeio é obrigatório." };
    if (!form.content.trim()) return { success: false, error: "Conteúdo do passeio é obrigatório." };

    const content = ensureTitle(form.nome, form.content);
    const embedding = await generateEmbedding(content);

    const updateRow: Record<string, unknown> = {
        content,
        tipo_passeio: form.nome.trim(),
        categoria: form.categoria || "outro",
        metadata: { nome: form.nome.trim(), categoria: form.categoria || "outro" },
    };
    if (embedding) updateRow.embedding = embedding;

    const { error } = await supabase.from("documents").update(updateRow).eq("id", id);

    if (error) {
        console.error("[updatePasseio]", error.message);
        return { success: false, error: error.message };
    }

    revalidatePath("/configuracoes");
    return { success: true, embeddingGerado: !!embedding };
}

export async function deletePasseio(id: number): Promise<{ success: boolean; error?: string }> {
    await requireAuth();
    const supabase = createServerSupabaseClient();

    const { error } = await supabase.from("documents").delete().eq("id", id);

    if (error) {
        console.error("[deletePasseio]", error.message);
        return { success: false, error: error.message };
    }

    revalidatePath("/configuracoes");
    return { success: true };
}

// =============================================
// CATEGORIAS — CRUD (armazenadas em crm_settings)
// =============================================

const CATEGORIAS_KEY = "categorias_passeio";

export async function getCategorias(): Promise<Categoria[]> {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
        .from("crm_settings")
        .select("valor")
        .eq("chave", CATEGORIAS_KEY)
        .maybeSingle();

    if (!data?.valor) return CATEGORIAS_DEFAULT;

    try {
        const parsed = JSON.parse(data.valor as string) as Categoria[];
        if (!Array.isArray(parsed) || parsed.length === 0) return CATEGORIAS_DEFAULT;
        return parsed;
    } catch {
        return CATEGORIAS_DEFAULT;
    }
}

async function saveCategorias(categorias: Categoria[]): Promise<void> {
    const supabase = createServerSupabaseClient();
    await supabase.from("crm_settings").upsert(
        { chave: CATEGORIAS_KEY, valor: JSON.stringify(categorias), updated_at: new Date().toISOString() },
        { onConflict: "chave" }
    );
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export async function upsertCategoria(
    novoNome: string,
    icone: string,
    originalSlug?: string
): Promise<{ success: boolean; slug?: string; error?: string }> {
    await requireAuth();

    if (!novoNome.trim()) return { success: false, error: "Nome obrigatório." };
    if (!icone.trim()) return { success: false, error: "Ícone obrigatório." };

    const novoSlug = slugify(novoNome);
    if (!novoSlug) return { success: false, error: "Nome inválido." };

    const categorias = await getCategorias();

    if (originalSlug) {
        const idx = categorias.findIndex((c) => c.slug === originalSlug);
        if (idx === -1) return { success: false, error: "Categoria original não encontrada." };

        if (novoSlug !== originalSlug) {
            const supabase = createServerSupabaseClient();
            const { error } = await supabase
                .from("documents")
                .update({ categoria: novoSlug })
                .eq("categoria", originalSlug);
            if (error) {
                console.error("[upsertCategoria] Falha ao reassign passeios:", error.message);
                return { success: false, error: error.message };
            }
        }

        categorias[idx] = { slug: novoSlug, nome: novoNome.trim(), icone };
    } else {
        if (categorias.some((c) => c.slug === novoSlug)) {
            return { success: false, error: "Já existe categoria com esse nome." };
        }
        categorias.push({ slug: novoSlug, nome: novoNome.trim(), icone });
    }

    await saveCategorias(categorias);
    revalidatePath("/configuracoes");
    return { success: true, slug: novoSlug };
}

export async function deleteCategoria(slug: string): Promise<{ success: boolean; error?: string }> {
    await requireAuth();

    if (slug === "outro") {
        return { success: false, error: "A categoria 'Outro' não pode ser excluída." };
    }

    const categorias = await getCategorias();
    const filtered = categorias.filter((c) => c.slug !== slug);
    if (filtered.length === categorias.length) {
        return { success: false, error: "Categoria não encontrada." };
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("documents")
        .update({ categoria: "outro" })
        .eq("categoria", slug);
    if (error) {
        console.error("[deleteCategoria]", error.message);
        return { success: false, error: error.message };
    }

    await saveCategorias(filtered);
    revalidatePath("/configuracoes");
    return { success: true };
}
