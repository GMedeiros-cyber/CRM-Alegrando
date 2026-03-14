import { headers } from "next/headers";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        console.error("CLERK_WEBHOOK_SECRET não configurado no .env.local");
        return new Response("Webhook secret não configurado", { status: 500 });
    }

    // Ler headers de verificação do Svix
    const headerPayload = await headers();
    const svixId = headerPayload.get("svix-id");
    const svixTimestamp = headerPayload.get("svix-timestamp");
    const svixSignature = headerPayload.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response("Headers svix ausentes", { status: 400 });
    }

    // Ler o body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // Verificar assinatura
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: WebhookEvent;

    try {
        evt = wh.verify(body, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        }) as WebhookEvent;
    } catch (err) {
        console.error("Assinatura de webhook inválida:", err);
        return new Response("Assinatura inválida", { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const eventType = evt.type;

    if (eventType === "user.created" || eventType === "user.updated") {
        const { id, email_addresses, first_name, last_name, image_url } = evt.data;

        const fullName = [first_name, last_name].filter(Boolean).join(" ") || "Sem nome";
        const primaryEmail = email_addresses?.[0]?.email_address || "";

        await supabase
            .from("users")
            .upsert(
                {
                    clerk_id: id,
                    name: fullName,
                    email: primaryEmail,
                    avatar_url: image_url || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "clerk_id" }
            );
    }

    if (eventType === "user.deleted") {
        const clerkId = evt.data.id;
        if (clerkId) {
            await supabase.from("users").delete().eq("clerk_id", clerkId);
        }
    }

    return new Response("OK", { status: 200 });
}
