"use client";

import { isGooglePickerNode } from "./drive-picker-button";

/**
 * O clique veio de um pedaço do editor que mora FORA da árvore do modal?
 *
 * O Google Picker e os popovers da barra de formatação são portalizados no
 * body, e o Radix trata clique/Esc neles como interação "fora" — fechando o
 * container e jogando o rascunho fora. Quem embrulha o editor precisa ensinar
 * o container a não reagir.
 *
 * Vale pro modal de composição E pro Sheet do painel do lead no mobile: os
 * dois são camadas do Radix, e o campo de responder inline vive dentro do
 * segundo.
 */
export function ehPortalDeEmail(alvo: EventTarget | null): boolean {
    if (isGooglePickerNode(alvo)) return true;
    const node = alvo instanceof Node ? alvo : null;
    const el = node instanceof Element ? node : node?.parentElement;
    return Boolean(el?.closest("[data-toolbar-popover]"));
}

/** Handler pronto pros `onInteractOutside` e companhia do Radix. */
export function ignorarSeForPortalDeEmail(e: {
    target?: EventTarget | null;
    preventDefault: () => void;
}) {
    if (ehPortalDeEmail(e.target ?? null)) e.preventDefault();
}
