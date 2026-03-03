import { clerkMiddleware } from '@clerk/nextjs/server';

// AUTH TEMPORARIAMENTE DESABILITADO
// Todas as rotas são públicas até as chaves do Clerk serem corrigidas.
// Para reativar, descomente o bloco abaixo:
//
// import { createRouteMatcher } from '@clerk/nextjs/server';
// const isPublicRoute = createRouteMatcher([
//     '/',
//     '/sign-in(.*)',
//     '/sign-up(.*)',
//     '/api/webhooks(.*)',
// ]);
//
// export default clerkMiddleware(async (auth, req) => {
//     if (!isPublicRoute(req)) {
//         await auth.protect();
//     }
// });

export default clerkMiddleware();

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
};
