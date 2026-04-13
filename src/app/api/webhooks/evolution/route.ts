import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
    const payload = await req.json();

    // Só processar messages.upsert enviadas pela Márcia (fromMe=true)
    if (payload.event !== "messages.upsert") {
        return NextResponse.json({ status: "skipped" });
    }

    // Processar reações do lead (evento messages.reaction)
    if (payload.event === "messages.reaction") {
        try {
            const reactionData = payload.data;
            const rawReactPhone = reactionData?.key?.remoteJid?.replace(/@.*$/, "") ?? "";
            const isReactFromMe = reactionData?.key?.fromMe === true;

            // Só processar reações do lead (não da Márcia)
            if (isReactFromMe || !rawReactPhone) return NextResponse.json({ status: "skipped" });

            const reactDigits = rawReactPhone.replace(/\D/g, "");
            const reactPhone = reactDigits.startsWith("55") && reactDigits.length >= 12 ? reactDigits : `55${reactDigits}`;

            const targetMessageId = reactionData?.reaction?.key?.id as string || "";
            const reactionEmoji = reactionData?.reaction?.text as string || "";

            if (!targetMessageId) return NextResponse.json({ status: "skipped" });

            const supabaseReact = createServerSupabaseClient();

            const { data: targetMsg } = await supabaseReact
                .from("messages")
                .select("id, reactions")
                .eq("telefone", reactPhone)
                .eq("metadata->>messageId", targetMessageId)
                .maybeSingle();

            if (targetMsg) {
                const reactions = (targetMsg.reactions as Record<string, string[]>) || {};
                const reacterKey = "lead";

                const newReactions: Record<string, string[]> = {};
                for (const [e, users] of Object.entries(reactions)) {
                    const filtered = (users as string[]).filter((u) => u !== reacterKey);
                    if (filtered.length > 0) newReactions[e] = filtered;
                }
                if (reactionEmoji) {
                    newReactions[reactionEmoji] = [...(newReactions[reactionEmoji] ?? []), reacterKey];
                }

                await supabaseReact
                    .from("messages")
                    .update({ reactions: newReactions })
                    .eq("id", targetMsg.id);
            }

            return NextResponse.json({ status: "ok" });
        } catch (err) {
            console.error("[EVO-WEBHOOK] Erro ao processar reação:", err);
            return NextResponse.json({ status: "error" });
        }
    }

    const data = payload.data;
    const isFromMe = data?.key?.fromMe === true;

    const rawPhone = data?.key?.remoteJid?.replace(/@.*$/, "") ?? "";
    if (!rawPhone || rawPhone.includes("@g.us")) {
        return NextResponse.json({ status: "skipped" }); // ignorar grupos
    }

    const supabaseEarly = createServerSupabaseClient();
    const digitsEarly = rawPhone.replace(/\D/g, "");
    const phone =
        digitsEarly.startsWith("55") && digitsEarly.length >= 12 ? digitsEarly : `55${digitsEarly}`;

    // Atualizar foto e nome do contato quando ele manda mensagem
    if (!isFromMe) {
        const pushName = data?.pushName || null;
        if (pushName) {
            supabaseEarly
                .from("Clientes _WhatsApp")
                .update({ nome: pushName })
                .eq("telefone", phone)
                .then();
        }
        return NextResponse.json({ status: "ok" });
    }

    const messageId = data?.key?.id;
    const content =
        data?.message?.conversation ||
        data?.message?.extendedTextMessage?.text ||
        null;
    if (!content || !messageId) return NextResponse.json({ status: "skipped" });

    const supabase = supabaseEarly;

    // Idempotência
    const { data: existing } = await supabase
        .from("messages")
        .select("id")
        .eq("telefone", phone)
        .eq("metadata->>messageId", messageId)
        .maybeSingle();

    if (existing) return NextResponse.json({ status: "duplicate" });

    await supabase.from("messages").insert({
        telefone: phone,
        sender_type: "equipe",
        sender_name: "Márcia",
        content,
        media_type: "text",
        created_at: data.messageTimestamp
            ? new Date(data.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        metadata: { messageId, source: "evolution-marcia" },
    });

    return NextResponse.json({ status: "ok" });
}
