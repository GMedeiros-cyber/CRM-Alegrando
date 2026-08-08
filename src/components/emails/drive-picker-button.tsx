"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { attachDriveFile, getDrivePickerToken } from "@/lib/actions/emails";
import type { EmailAttachment } from "@/lib/types/email";
import { GoogleDriveIcon } from "./google-drive-icon";

const GAPI_SRC = "https://apis.google.com/js/api.js";

/**
 * O Picker se monta em document.body, FORA da árvore do Dialog do Radix.
 * Para o Radix, qualquer clique nele é "clique fora" e fecha o modal de
 * composição — levando junto o rascunho. Estes dois helpers deixam o modal
 * reconhecer o que é do Picker e ignorar.
 */
const PICKER_SELECTOR = ".picker-dialog, .picker-dialog-bg, .picker, .goog-modalpopup";

export function isGooglePickerNode(node: EventTarget | Node | null): boolean {
    if (!node || !(node instanceof Node)) return false;
    const el = node instanceof Element ? node : node.parentElement;
    return Boolean(el?.closest(PICKER_SELECTOR));
}

export function isGooglePickerOpen(): boolean {
    return document.querySelector(PICKER_SELECTOR) !== null;
}

// Tipagem mínima do Picker: o Google não publica @types e só usamos um punhado
// de símbolos. Declarar o que se usa evita `any` espalhado pelo arquivo.
type PickerDocument = {
    id: string;
    name?: string;
    mimeType?: string;
    sizeBytes?: number | string;
};

type PickerBuilder = {
    enableFeature: (feature: unknown) => PickerBuilder;
    setDeveloperKey: (key: string) => PickerBuilder;
    setOAuthToken: (token: string) => PickerBuilder;
    setAppId: (appId: string) => PickerBuilder;
    setOrigin: (origin: string) => PickerBuilder;
    setTitle: (title: string) => PickerBuilder;
    addView: (view: unknown) => PickerBuilder;
    setCallback: (cb: (data: PickerCallbackData) => void) => PickerBuilder;
    build: () => { setVisible: (visible: boolean) => void };
};

type PickerCallbackData = {
    action: string;
    docs?: PickerDocument[];
};

type GooglePickerNamespace = {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: unknown) => {
        setIncludeFolders: (v: boolean) => unknown;
        setSelectFolderEnabled: (v: boolean) => unknown;
        setOwnedByMe?: (v: boolean) => unknown;
    };
    ViewId: { DOCS: unknown };
    Feature: { MULTISELECT_ENABLED: unknown };
    Action: { PICKED: string; CANCEL: string };
};

declare global {
    interface Window {
        gapi?: { load: (libs: string, cb: () => void) => void };
        google?: { picker?: GooglePickerNamespace };
    }
}

/** Carrega o api.js uma vez só, sob demanda — nunca no load da página. */
function loadGapi(): Promise<void> {
    if (window.gapi) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const existente = document.querySelector<HTMLScriptElement>(
            `script[src="${GAPI_SRC}"]`,
        );
        if (existente) {
            existente.addEventListener("load", () => resolve());
            existente.addEventListener("error", () => reject(new Error("Falha ao carregar o Google.")));
            return;
        }

        const script = document.createElement("script");
        script.src = GAPI_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Falha ao carregar o Google."));
        document.body.appendChild(script);
    });
}

function loadPickerModule(): Promise<GooglePickerNamespace> {
    return new Promise((resolve, reject) => {
        if (window.google?.picker) {
            resolve(window.google.picker);
            return;
        }
        if (!window.gapi) {
            reject(new Error("Google API não carregada."));
            return;
        }
        window.gapi.load("picker", () => {
            if (window.google?.picker) resolve(window.google.picker);
            else reject(new Error("Módulo do Picker não carregou."));
        });
    });
}

export interface DrivePickerButtonProps {
    onAttach: (attachment: EmailAttachment) => void;
    onError: (message: string) => void;
}

/**
 * Abre a janela NATIVA do Google Picker, já apontada pro Drive da Alegrando.
 *
 * O token vem do servidor (conta da empresa), então a equipe nunca faz login
 * no Google e nunca vê o Drive pessoal dela. O arquivo escolhido segue pelo
 * mesmo caminho de sempre: `attachDriveFile` baixa e republica no R2.
 */
export function DrivePickerButton({ onAttach, onError }: DrivePickerButtonProps) {
    const [busy, setBusy] = useState(false);
    // Reaproveita o token enquanto ele vale, em vez de bater no servidor a
    // cada abertura do Picker.
    const tokenRef = useRef<{ accessToken: string; expiresAt: number; appId: string } | null>(null);

    const pegarToken = useCallback(async () => {
        const atual = tokenRef.current;
        if (atual && atual.expiresAt > Date.now()) return atual;

        const res = await getDrivePickerToken();
        if (!res.ok) throw new Error(res.error);

        const novo = {
            accessToken: res.accessToken,
            expiresAt: res.expiresAt,
            appId: res.appId,
        };
        tokenRef.current = novo;
        return novo;
    }, []);

    async function abrir() {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
        if (!apiKey) {
            onError(
                "Falta NEXT_PUBLIC_GOOGLE_PICKER_API_KEY — o seletor do Drive não abre sem ela.",
            );
            return;
        }

        setBusy(true);
        try {
            const [{ accessToken, appId }] = await Promise.all([
                pegarToken(),
                loadGapi(),
            ]);
            const picker = await loadPickerModule();

            const view = new picker.DocsView(picker.ViewId.DOCS);
            view.setIncludeFolders(true);
            // Pasta não é anexo — deixar selecionar só criaria erro depois.
            view.setSelectFolderEnabled(false);

            const instancia = new picker.PickerBuilder()
                // Vários arquivos de uma vez: o normal é anexar a proposta e o
                // catálogo juntos, não abrir o Picker duas vezes.
                .enableFeature(picker.Feature.MULTISELECT_ENABLED)
                .setDeveloperKey(apiKey)
                .setOAuthToken(accessToken)
                .setAppId(appId)
                .setOrigin(window.location.protocol + "//" + window.location.host)
                .setTitle("Anexar do Drive da Alegrando")
                .addView(view)
                .setCallback((data) => {
                    if (data.action !== picker.Action.PICKED) return;
                    const docs = data.docs ?? [];
                    if (docs.length > 0) void anexar(docs);
                })
                .build();

            instancia.setVisible(true);
        } catch (err) {
            onError(err instanceof Error ? err.message : "Erro ao abrir o Drive.");
        } finally {
            setBusy(false);
        }
    }

    async function anexar(docs: PickerDocument[]) {
        setBusy(true);
        const falhas: string[] = [];
        try {
            for (const doc of docs) {
                try {
                    // Toda a validação (Docs nativo, tamanho) continua no
                    // servidor: o Picker lista tudo e não dá pra excluir tipo
                    // por lá, só incluir.
                    const res = await attachDriveFile(doc.id);
                    if (res.ok) onAttach(res.attachment);
                    else falhas.push(res.error);
                } catch (err) {
                    const alvo = doc.name || doc.id;
                    falhas.push(
                        err instanceof Error ? err.message : `Erro em "${alvo}".`,
                    );
                }
            }
            // Um arquivo recusado não pode impedir os outros de anexar.
            if (falhas.length > 0) onError(falhas.join(" "));
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void abrir()}
            disabled={busy}
            title="Inserir arquivo do Drive"
            aria-label="Inserir arquivo do Drive"
            className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
        >
            {busy ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
                <GoogleDriveIcon className="w-4 h-4" />
            )}
        </button>
    );
}
