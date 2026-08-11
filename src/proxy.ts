import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Rotas fora da sessão do Clerk.
 *
 * "Público" aqui é só em relação ao Clerk: quem chama são serviços, não
 * pessoas, e cada uma faz a própria conferência de segredo. `/api/email-replies`
 * é o worker do n8n pedindo URL assinada pra subir anexo — ele valida o bearer
 * contra a service key do Supabase.
 */
const isPublicRoute = createRouteMatcher([
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/unauthorized',
    '/api/webhooks(.*)',
    '/api/cron(.*)',
    '/api/email-replies(.*)',
    '/api/health',
]);

export default clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req)) {
        await auth.protect();
    }
});

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
};
