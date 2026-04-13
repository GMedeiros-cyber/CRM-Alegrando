import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
    const payload = await req.json();

    // Só processar messages.upsert enviadas pela Márcia (fromMe=true)
    if (payload.event !== "messages.upsert") {
        return NextResponse.json({ status: "skipped" });
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
