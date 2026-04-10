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
    if (!isFromMe) return NextResponse.json({ status: "skipped" });

    const rawPhone = data?.key?.remoteJid?.replace(/@.*$/, "") ?? "";
    if (!rawPhone || rawPhone.includes("@g.us")) {
        return NextResponse.json({ status: "skipped" }); // ignorar grupos
    }

    const messageId = data?.key?.id;
    const content =
        data?.message?.conversation ||
        data?.message?.extendedTextMessage?.text ||
        null;
    if (!content || !messageId) return NextResponse.json({ status: "skipped" });

    const supabase = createServerSupabaseClient();

    // Normalizar telefone
    const digits = rawPhone.replace(/\D/g, "");
    const phone =
        digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;

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
