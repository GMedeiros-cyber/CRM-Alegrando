"use client";

import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Bold,
    ChevronDown,
    Indent,
    Italic,
    Link2,
    List,
    ListOrdered,
    Outdent,
    Quote,
    RemoveFormatting,
    Strikethrough,
    Type,
    Underline,
} from "lucide-react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";
import {
    EMAIL_COLORS,
    EMAIL_DEFAULT_FONT,
    EMAIL_DEFAULT_SIZE,
    EMAIL_FONTS,
    EMAIL_SIZES,
} from "@/lib/email/editor";
import { ToolbarPopover } from "./toolbar-popover";

export interface RichTextEditorHandle {
    /** Insere texto no ponto do cursor (emoji, por exemplo). */
    insertText: (text: string) => void;
    focus: () => void;
}

interface RichTextEditorProps {
    onChange: (html: string) => void;
    placeholder?: string;
    /** Área de anexos, entre o corpo e a barra — como no Gmail. */
    attachmentSlot?: React.ReactNode;
    /** Slot à direita da barra: anexo, Drive, emoji — quem monta é o modal. */
    toolbarExtras?: React.ReactNode;
    /** Arquivo colado no corpo vira anexo, pelo mesmo caminho do clipe. */
    onPasteFiles?: (files: File[]) => void;
    /** Teto do bloco inteiro — o painel do lead tem bem menos espaço. */
    containerClassName?: string;
    /** Altura da área de escrita. */
    bodyClassName?: string;
}

/** Comandos com liga/desliga que a barra reflete conforme o cursor anda. */
const ESTADOS = [
    "bold",
    "italic",
    "underline",
    "strikeThrough",
    "insertOrderedList",
    "insertUnorderedList",
    "justifyLeft",
    "justifyCenter",
    "justifyRight",
    "justifyFull",
] as const;

type EstadoComando = (typeof ESTADOS)[number] | "blockquote";

/**
 * Guarda e devolve a seleção do editor em volta de um popover.
 *
 * Os botões usam `onMouseDown preventDefault` pra não roubar o foco, mas isso
 * não cobre tudo: qualquer campo focável dentro do painel (o input do link) e
 * o gerenciamento de foco do Dialog do Radix derrubam a Range. Sem ela,
 * execCommand não tem onde aplicar e o clique parece não fazer nada.
 */
function useSelecaoSalva(editorRef: React.RefObject<HTMLDivElement | null>) {
    const rangeRef = useRef<Range | null>(null);

    function salvar() {
        const sel = document.getSelection();
        const dentro =
            sel && sel.rangeCount > 0 && sel.anchorNode
                ? editorRef.current?.contains(sel.anchorNode)
                : false;
        rangeRef.current = dentro && sel ? sel.getRangeAt(0).cloneRange() : null;
        return sel && dentro ? sel.toString() : "";
    }

    function restaurar() {
        editorRef.current?.focus();
        const sel = document.getSelection();
        if (rangeRef.current && sel) {
            sel.removeAllRanges();
            sel.addRange(rangeRef.current);
        }
    }

    return { salvar, restaurar };
}

type Selecao = ReturnType<typeof useSelecaoSalva>;

/**
 * Editor de corpo de e-mail com barra no rodapé, no espírito do Gmail.
 *
 * Usa contentEditable + document.execCommand. A API está formalmente
 * deprecada, mas continua sendo a única que produz **estilo inline** de graça
 * em todos os navegadores — que é exatamente o formato que e-mail exige. As
 * alternativas modernas (Tiptap/Lexical) guardam o conteúdo em estado próprio
 * e emitem HTML com classes, exigindo um serializador só pra reinlinar tudo.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
    function RichTextEditor(
        {
            onChange,
            placeholder,
            toolbarExtras,
            onPasteFiles,
            attachmentSlot,
            containerClassName = "max-h-[52vh]",
            bodyClassName = "min-h-[96px]",
        },
        ref,
    ) {
        const editorRef = useRef<HTMLDivElement>(null);
        const [showToolbar, setShowToolbar] = useState(true);
        const [empty, setEmpty] = useState(true);
        const [ativos, setAtivos] = useState<Set<EstadoComando>>(new Set());
        const [corAtual, setCorAtual] = useState(EMAIL_COLORS[0]);
        const selecao = useSelecaoSalva(editorRef);

        const emit = useCallback(() => {
            const html = editorRef.current?.innerHTML ?? "";
            setEmpty(
                html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length === 0,
            );
            onChange(html);
        }, [onChange]);

        useImperativeHandle(ref, () => ({
            insertText(text: string) {
                editorRef.current?.focus();
                document.execCommand("insertText", false, text);
                emit();
            },
            focus() {
                editorRef.current?.focus();
            },
        }));

        // styleWithCSS faz o execCommand emitir style="..." em vez de <font>,
        // que é o que sobrevive nos clientes de e-mail.
        useEffect(() => {
            try {
                document.execCommand("styleWithCSS", false, "true");
            } catch {
                /* navegador sem suporte: cai no <font>, ainda funciona */
            }
        }, []);

        /**
         * Lê do documento quais formatos valem na posição atual do cursor.
         * É isso que faz o botão acender sozinho ao clicar num trecho que já
         * está em negrito — em vez de só reagir ao último clique na barra.
         */
        const sincronizarEstado = useCallback(() => {
            const editor = editorRef.current;
            if (!editor) return;

            const sel = document.getSelection();
            const dentro =
                sel && sel.anchorNode ? editor.contains(sel.anchorNode) : false;
            if (!dentro) return;

            const novos = new Set<EstadoComando>();
            for (const cmd of ESTADOS) {
                try {
                    if (document.queryCommandState(cmd)) novos.add(cmd);
                } catch {
                    /* comando não suportado: ignora */
                }
            }
            try {
                // queryCommandState não cobre citação; o bloco atual cobre.
                const bloco = document.queryCommandValue("formatBlock").toLowerCase();
                if (bloco === "blockquote") novos.add("blockquote");
            } catch {
                /* idem */
            }
            setAtivos(novos);
        }, []);

        useEffect(() => {
            document.addEventListener("selectionchange", sincronizarEstado);
            return () =>
                document.removeEventListener("selectionchange", sincronizarEstado);
        }, [sincronizarEstado]);

        function exec(command: string, value?: string) {
            editorRef.current?.focus();
            document.execCommand(command, false, value);
            emit();
            sincronizarEstado();
        }

        // Colar: arquivo vira anexo; texto entra puro. HTML de fora (Word,
        // site) traz markup que quebra a renderização no cliente de e-mail.
        function handlePaste(e: React.ClipboardEvent) {
            const arquivos = Array.from(e.clipboardData.files || []);
            if (arquivos.length > 0 && onPasteFiles) {
                e.preventDefault();
                onPasteFiles(arquivos);
                return;
            }

            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            emit();
        }

        return (
            // Coluna flex com teto: o CORPO é quem estica e encolhe, bandeja
            // e barra ficam com altura natural. Sem isto as três áreas somam
            // livremente e, com muitos anexos, a barra era empurrada pra fora.
            <div
                className={cn(
                    "flex flex-col rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-brand-500/40 overflow-hidden",
                    containerClassName,
                )}
            >
                <div className="relative flex flex-1 min-h-0 flex-col">
                    {empty && placeholder && (
                        <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
                            {placeholder}
                        </span>
                    )}
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={emit}
                        onBlur={emit}
                        onPaste={handlePaste}
                        onKeyUp={sincronizarEstado}
                        onMouseUp={sincronizarEstado}
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Corpo do e-mail"
                        className={cn(
                            "flex-1 overflow-y-auto px-3 py-2 text-sm outline-none [&_a]:text-[#1a73e8] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6",
                            bodyClassName,
                        )}
                        style={{
                            fontFamily: EMAIL_DEFAULT_FONT,
                            fontSize: EMAIL_DEFAULT_SIZE,
                            lineHeight: 1.5,
                        }}
                    />
                </div>

                <div className="shrink-0">{attachmentSlot}</div>

                <div className="shrink-0 flex flex-wrap items-center gap-0.5 border-t border-border bg-muted/60 px-2 py-2">
                    <ToolbarButton
                        active={showToolbar}
                        onClick={() => setShowToolbar((v) => !v)}
                        title="Opções de formatação"
                    >
                        <Type className="w-4 h-4" />
                    </ToolbarButton>

                    {showToolbar && (
                        <>
                            <Divider />
                            <SelectMenu
                                label={EMAIL_FONTS[0].label}
                                width="w-40"
                                items={EMAIL_FONTS.map((f) => ({
                                    key: f.stack,
                                    label: f.label,
                                    style: { fontFamily: f.stack },
                                }))}
                                onPick={(stack) => exec("fontName", stack)}
                                selecao={selecao}
                            />
                            <SelectMenu
                                label="Tamanho"
                                width="w-36"
                                items={EMAIL_SIZES.map((s) => ({
                                    key: s.px,
                                    label: s.label,
                                    style: { fontSize: s.px },
                                }))}
                                onPick={(px) => {
                                    // execCommand("fontSize") só aceita 1-7;
                                    // aplicamos px no elemento gerado.
                                    exec("fontSize", "7");
                                    editorRef.current
                                        ?.querySelectorAll('font[size="7"]')
                                        .forEach((el) => {
                                            el.removeAttribute("size");
                                            (el as HTMLElement).style.fontSize = px;
                                        });
                                    emit();
                                }}
                                selecao={selecao}
                            />
                            <Divider />
                            <ToolbarButton active={ativos.has("bold")} onClick={() => exec("bold")} title="Negrito (Ctrl+B)">
                                <Bold className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("italic")} onClick={() => exec("italic")} title="Itálico (Ctrl+I)">
                                <Italic className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("underline")} onClick={() => exec("underline")} title="Sublinhado (Ctrl+U)">
                                <Underline className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("strikeThrough")} onClick={() => exec("strikeThrough")} title="Tachado">
                                <Strikethrough className="w-4 h-4" />
                            </ToolbarButton>
                            <ColorMenu
                                cor={corAtual}
                                onPick={(color) => { setCorAtual(color); exec("foreColor", color); }}
                                selecao={selecao}
                            />
                            <Divider />
                            <ToolbarButton active={ativos.has("justifyLeft")} onClick={() => exec("justifyLeft")} title="Alinhar à esquerda">
                                <AlignLeft className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("justifyCenter")} onClick={() => exec("justifyCenter")} title="Centralizar">
                                <AlignCenter className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("justifyRight")} onClick={() => exec("justifyRight")} title="Alinhar à direita">
                                <AlignRight className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("justifyFull")} onClick={() => exec("justifyFull")} title="Justificar">
                                <AlignJustify className="w-4 h-4" />
                            </ToolbarButton>
                            <Divider />
                            <ToolbarButton active={ativos.has("insertUnorderedList")} onClick={() => exec("insertUnorderedList")} title="Lista com marcadores">
                                <List className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton active={ativos.has("insertOrderedList")} onClick={() => exec("insertOrderedList")} title="Lista numerada">
                                <ListOrdered className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("outdent")} title="Diminuir recuo">
                                <Outdent className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("indent")} title="Aumentar recuo">
                                <Indent className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton
                                active={ativos.has("blockquote")}
                                onClick={() =>
                                    exec(
                                        "formatBlock",
                                        ativos.has("blockquote") ? "div" : "blockquote",
                                    )
                                }
                                title="Citação"
                            >
                                <Quote className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("removeFormat")} title="Limpar formatação">
                                <RemoveFormatting className="w-4 h-4" />
                            </ToolbarButton>
                        </>
                    )}

                    <Divider />
                    <LinkMenu selecao={selecao} onDone={emit} />
                    {toolbarExtras}
                </div>
            </div>
        );
    },
);

function Divider() {
    return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

function ToolbarButton({
    children,
    onClick,
    title,
    active = false,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            // preventDefault mantém a seleção do texto viva: sem isso o clique
            // tira o foco do editor e o comando não acha o alvo.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            title={title}
            aria-label={title}
            aria-pressed={active}
            className={cn(
                "p-1.5 rounded transition-colors",
                active
                    ? "bg-brand-500/25 text-brand-700 dark:text-brand-300 ring-1 ring-brand-500/40"
                    : "text-foreground/75 hover:bg-muted-foreground/15 hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function SelectMenu({
    label,
    items,
    onPick,
    width,
    selecao,
}: {
    label: string;
    items: { key: string; label: string; style?: React.CSSProperties }[];
    onPick: (key: string) => void;
    width: string;
    selecao: Selecao;
}) {
    const [open, setOpen] = useState(false);
    // Âncora em state (e não ref): o popover precisa dela no render, e ref
    // lido durante o render não dispara re-render quando o nó aparece.
    const [btn, setBtn] = useState<HTMLButtonElement | null>(null);

    return (
        <>
            <button
                ref={setBtn}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { selecao.salvar(); setOpen((v) => !v); }}
                aria-expanded={open}
                className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                    open
                        ? "bg-brand-500/25 text-brand-700 dark:text-brand-300"
                        : "text-foreground/75 hover:bg-muted-foreground/15 hover:text-foreground",
                )}
            >
                <span className="max-w-[86px] truncate">{label}</span>
                <ChevronDown className="w-3 h-3" />
            </button>
            {open && (
                <ToolbarPopover
                    anchor={btn}
                    onClose={() => setOpen(false)}
                    className={cn("py-1", width)}
                >
                    {items.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { selecao.restaurar(); onPick(item.key); setOpen(false); }}
                            style={item.style}
                            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted transition-colors"
                        >
                            {item.label}
                        </button>
                    ))}
                </ToolbarPopover>
            )}
        </>
    );
}

function ColorMenu({
    cor,
    onPick,
    selecao,
}: {
    cor: string;
    onPick: (color: string) => void;
    selecao: Selecao;
}) {
    const [open, setOpen] = useState(false);
    const [btn, setBtn] = useState<HTMLButtonElement | null>(null);

    return (
        <>
            <button
                ref={setBtn}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { selecao.salvar(); setOpen((v) => !v); }}
                title="Cor do texto"
                aria-label="Cor do texto"
                aria-expanded={open}
                className={cn(
                    "flex items-center gap-0.5 px-1.5 py-1 rounded transition-colors",
                    open
                        ? "bg-brand-500/25 text-brand-700 dark:text-brand-300"
                        : "text-foreground/75 hover:bg-muted-foreground/15 hover:text-foreground",
                )}
            >
                {/* A cor escolhida vira uma barra sob o A, como no Gmail. */}
                <span className="flex flex-col items-center gap-[2px]">
                    <span className="font-bold text-sm leading-none">A</span>
                    <span
                        className="h-[3px] w-3.5 rounded-sm border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: cor }}
                    />
                </span>
                <ChevronDown className="w-3 h-3" />
            </button>
            {open && (
                <ToolbarPopover anchor={btn} onClose={() => setOpen(false)} className="p-2">
                    <div className="grid grid-cols-6 gap-1">
                        {EMAIL_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { selecao.restaurar(); onPick(color); setOpen(false); }}
                                title={color}
                                aria-label={`Cor ${color}`}
                                style={{ backgroundColor: color }}
                                className={cn(
                                    "w-5 h-5 rounded border transition-transform hover:scale-110",
                                    color === cor
                                        ? "border-brand-500 ring-2 ring-brand-500/40"
                                        : "border-border",
                                )}
                            />
                        ))}
                    </div>
                </ToolbarPopover>
            )}
        </>
    );
}

/**
 * Inserção de link com UI do CRM.
 *
 * O `prompt()` nativo, além de feio, rouba o foco e derruba a seleção. Aqui a
 * Range é guardada na abertura e devolvida na hora de aplicar — sem isso o
 * link cairia no lugar errado depois de digitar na caixinha.
 */
function LinkMenu({
    selecao,
    onDone,
}: {
    selecao: Selecao;
    onDone: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState("");
    const [texto, setTexto] = useState("");
    const [erro, setErro] = useState("");
    const campoUrlRef = useRef<HTMLInputElement>(null);
    // Muda o que é renderizado (mostrar ou não o campo "Texto exibido"),
    // então é state — ref não re-renderiza.
    const [tinhaSelecao, setTinhaSelecao] = useState(false);

    function abrir() {
        // Salva ANTES de o popover montar: depois disso o foco já saiu do
        // editor e a Range não existe mais.
        const selecionado = selecao.salvar();
        setTinhaSelecao(selecionado.length > 0);

        setTexto(selecionado);
        setUrl("");
        setErro("");
        setOpen(true);
    }

    function aplicar() {
        const bruto = url.trim();
        if (!bruto) {
            setErro("Informe o endereço.");
            return;
        }
        // Sem protocolo o navegador trataria como link relativo.
        const destino = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
        try {
            new URL(destino);
        } catch {
            setErro("Endereço inválido.");
            return;
        }

        selecao.restaurar();

        if (tinhaSelecao) {
            document.execCommand("createLink", false, destino);
        } else {
            const rotulo = (texto.trim() || destino).replace(/[<>&"]/g, (c) =>
                ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] as string,
            );
            document.execCommand(
                "insertHTML",
                false,
                `<a href="${destino}" style="color:#1a73e8">${rotulo}</a>`,
            );
        }

        onDone();
        setOpen(false);
    }

    return (
        <Popover.Root
            open={open}
            onOpenChange={(v) => {
                if (v) abrir();
                else setOpen(false);
            }}
        >
            <Popover.Trigger asChild>
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    title="Inserir link (Ctrl+K)"
                    aria-label="Inserir link"
                    className={cn(
                        "p-1.5 rounded transition-colors",
                        open
                            ? "bg-brand-500/25 text-brand-700 dark:text-brand-300"
                            : "text-foreground/75 hover:bg-muted-foreground/15 hover:text-foreground",
                    )}
                >
                    <Link2 className="w-4 h-4" />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    data-toolbar-popover=""
                    // Só o Popover do Radix resolve o link: ele entra na pilha
                    // de camadas e PAUSA o FocusScope do Dialog. Com o popover
                    // caseiro, o Dialog puxava o foco de volta assim que ele
                    // caía no input, e não dava pra digitar.
                    onOpenAutoFocus={(e) => {
                        // O autoFocus do input cuida disso; deixar o Radix
                        // focar o container primeiro causa um pisca-pisca.
                        e.preventDefault();
                        campoUrlRef.current?.focus();
                    }}
                    className="z-[70] w-72 rounded-lg border border-border bg-popover p-3 shadow-xl"
                >
                    <div className="space-y-2">
                        <label className="block">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Endereço
                            </span>
                            <input
                                ref={campoUrlRef}
                                value={url}
                                onChange={(e) => { setUrl(e.target.value); setErro(""); }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); aplicar(); }
                                }}
                                placeholder="exemplo.com.br"
                                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                            />
                        </label>

                        {!tinhaSelecao && (
                            <label className="block">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Texto exibido
                                </span>
                                <input
                                    value={texto}
                                    onChange={(e) => setTexto(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") { e.preventDefault(); aplicar(); }
                                    }}
                                    placeholder="(usa o próprio endereço)"
                                    className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                                />
                            </label>
                        )}

                        {erro && <p className="text-xs text-red-500">{erro}</p>}

                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={aplicar}
                                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 transition-colors"
                            >
                                Inserir
                            </button>
                        </div>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
