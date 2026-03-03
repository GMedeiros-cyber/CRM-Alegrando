"use server";

import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/**
 * Retorna o Top 5 destinos mais requisitados.
 * GROUP BY destino + COUNT, ordena DESC, limit 5.
 */
export async function getTopDestinos() {
    const rows = await db
        .select({
            destino: leads.destino,
            total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(leads)
        .where(
            sql`${leads.destino} IS NOT NULL AND ${leads.destino} != ''`
        )
        .groupBy(leads.destino)
        .orderBy(sql`count(*) DESC`)
        .limit(5);

    return rows.map((r) => ({
        destino: r.destino ?? "Sem destino",
        total: r.total,
    }));
}
