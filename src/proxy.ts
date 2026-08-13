import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Rotas fora da sessão do Clerk.
 *
 * "Público" aqui é só em relação ao Clerk: quem chama são serviços, não
 * pessoas, e cada uma faz a própria conferência de segredo. `/api/email-replies`
 * é o worker do n8n pedindo URL assinada pra subir anexo — ele valida o bearer
 * contra a service key do Supabase.
 *
 * `/sign-up` NÃO está aqui de propósito. São quatro pessoas na equipe e conta
 * nova se cria no painel do Clerk; deixar o cadastro aberto significava que
 * qualquer um que achasse o endereço entrava e lia os leads. Ver §2 do SKILL.
 *
 * `/sign-in` e `/unauthorized` precisam continuar públicas — são as telas de
 * saída da guarda abaixo, e protegê-las faria a pessoa não autorizada rodar em
 * laço sem nunca ver o motivo.
 */
const isPublicRoute = createRouteMatcher([
    '/sign-in(.*)',
    '/unauthorized',
    '/api/webhooks(.*)',
    '/api/cron(.*)',
    '/api/email-replies(.*)',
    '/api/health',
]);

/**
 * Quem pode usar o CRM, por e-mail.
 *
 * **Lista vazia = não checa**, de propósito. Inverter para "vazia = bloqueia
 * tudo" parece mais seguro e é pior: um único deploy sem a variável derrubaria
 * o CRM para a equipe inteira. A correção certa é garantir que a variável
 * exista — não trocar o padrão por um que falha fechado.
 */
function listaAutorizada(): string[] {
    return (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Cache de e-mail por usuário.
 *
 * A guarda roda em TODA requisição — página, server action e rota de API. Sem
 * cache seria uma ida ao Clerk por navegação. São quatro pessoas, então na
 * prática isto é uma chamada por instância a cada cinco minutos.
 */
const cacheEmail = new Map<string, { email: string | null; ate: number }>();
const TTL_MS = 5 * 60_000;

async function emailDoUsuario(userId: string, claimEmail: unknown): Promise<string | null> {
    // Se a instância do Clerk publicar o e-mail no token da sessão, sai de graça.
    if (typeof claimEmail === 'string' && claimEmail.includes('@')) {
        return claimEmail.trim().toLowerCase();
    }

    const agora = Date.now();
    const guardado = cacheEmail.get(userId);
    if (guardado && guardado.ate > agora) return guardado.email;

    const cliente = await clerkClient();
    const user = await cliente.users.getUser(userId);
    const principal =
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
        user.emailAddresses[0];
    const email = principal?.emailAddress?.trim().toLowerCase() ?? null;

    cacheEmail.set(userId, { email, ate: agora + TTL_MS });
    return email;
}

/**
 * A sessão é de alguém que pode usar o CRM?
 *
 * Em caso de dúvida **libera**, e grita no log. O raciocínio: com `/sign-up`
 * fechado, ter sessão no Clerk já exige uma conta criada à mão no painel, então
 * esta lista é segunda camada, não a única. Falhar fechado por uma instabilidade
 * de rede tiraria as quatro pessoas do ar por causa de um problema que não é
 * delas.
 */
async function autorizado(userId: string | null, claimEmail: unknown): Promise<boolean> {
    const lista = listaAutorizada();
    if (lista.length === 0) return true;
    if (!userId) return true;

    try {
        const email = await emailDoUsuario(userId, claimEmail);
        if (!email) {
            console.error(`[proxy] usuário ${userId} sem e-mail no Clerk — liberando e registrando`);
            return true;
        }
        return lista.includes(email);
    } catch (err) {
        console.error('[proxy] falha ao consultar o Clerk — liberando para não derrubar a equipe:', err);
        return true;
    }
}

export default clerkMiddleware(async (auth, req) => {
    // Serviço (webhook, cron, worker) e telas de saída passam direto: nenhum
    // deles tem sessão do Clerk, e alcançá-los derrubaria Z-API, Evolution e o
    // Gmail Push.
    if (isPublicRoute(req)) return;

    await auth.protect();

    const { userId, sessionClaims } = await auth();
    if (await autorizado(userId, (sessionClaims as Record<string, unknown> | null)?.email)) return;

    console.warn(`[proxy] sessão fora da ALLOWED_EMAILS bloqueada em ${req.nextUrl.pathname}`);

    // A checagem vive aqui, e não só no layout de `(app)`, porque no App Router
    // a invocação de uma server action NÃO passa pelo layout: sem isto, uma
    // conta indevida continuaria chamando as actions e lendo os leads direto.
    // Por isso a resposta depende do tipo de requisição — navegação vê a tela,
    // action e API levam 403.
    const ehNavegacao = req.headers.get('accept')?.includes('text/html') ?? false;
    return ehNavegacao
        ? NextResponse.redirect(new URL('/unauthorized', req.url))
        : new NextResponse('Não autorizado.', { status: 403 });
});

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
};
