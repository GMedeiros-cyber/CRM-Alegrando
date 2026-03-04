import { google } from "googleapis";

/**
 * Cria e retorna um cliente autenticado do Google Calendar v3.
 * Usa OAuth2 com refresh_token para autenticação server-side.
 */
export function getCalendarClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
    return google.calendar({ version: "v3", auth });
}
