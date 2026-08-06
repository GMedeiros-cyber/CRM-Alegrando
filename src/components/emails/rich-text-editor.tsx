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
import { cn } from "@/lib/utils";
import {
    EMAIL_COLORS,
    EMAIL_DEFAULT_FONT,
    EMAIL_DEFAULT_SIZE,
    EMAIL_FONTS,
    EMAIL_SIZES,
} from "@/lib/email/editor";

export interface RichTextEditorHandle {
    /** Insere texto no ponto do cursor (emoji, por exemplo). */
    insertText: (text: string) => void;
    focus: () => void;
}

interface RichTextEditorProps {
    onChange: (html: string) => void;
    placeholder?: string;
    /** Slot à direita da barra: anexo, Drive, emoji — quem monta é o modal. */
    toolbarExtras?: React.ReactNode;
}

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
    function RichTextEditor({ onChange, placeholder, toolbarExtras }, ref) {
        const editorRef = useRef<HTMLDivElement>(null);
        const [showToolbar, setShowToolbar] = useState(true);
        const [empty, setEmpty] = useState(true);

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

        function exec(command: string, value?: string) {
            editorRef.current?.focus();
            document.execCommand(command, false, value);
            emit();
        }

        function handleLink() {
            const selection = window.getSelection();
            const selected = selection?.toString() || "";
            const url = window.prompt("Endereço do link:", "https://");
            if (!url || url === "https://") return;
            const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
            editorRef.current?.focus();
            if (selected) {
                document.execCommand("createLink", false, safe);
            } else {
                document.execCommand(
                    "insertHTML",
                    false,
                    `<a href="${safe}" style="color:#1a73e8">${safe}</a>`,
                );
            }
            emit();
        }

        // Colar como texto puro: HTML de fora (Word, site) entra com lixo de
        // markup que quebra a renderização no cliente de e-mail.
        function handlePaste(e: React.ClipboardEvent) {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            emit();
        }

        return (
            <div className="rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-brand-500/40 overflow-hidden">
                <div className="relative">
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
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Corpo do e-mail"
                        className="min-h-[160px] max-h-[320px] overflow-y-auto px-3 py-2 text-sm outline-none [&_a]:text-[#1a73e8] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
                        style={{
                            fontFamily: EMAIL_DEFAULT_FONT,
                            fontSize: EMAIL_DEFAULT_SIZE,
                            lineHeight: 1.5,
                        }}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-0.5 border-t border-border bg-muted/40 px-2 py-1.5">
                    <ToolbarToggle
                        active={showToolbar}
                        onClick={() => setShowToolbar((v) => !v)}
                        title="Opções de formatação"
                    >
                        <Type className="w-4 h-4" />
                    </ToolbarToggle>

                    {showToolbar && (
                        <>
                            <Divider />
                            <SelectMenu
                                label={EMAIL_FONTS[0].label}
                                width="w-36"
                                items={EMAIL_FONTS.map((f) => ({
                                    key: f.stack,
                                    label: f.label,
                                    style: { fontFamily: f.stack },
                                }))}
                                onPick={(stack) => exec("fontName", stack)}
                            />
                            <SelectMenu
                                label="Tamanho"
                                icon={<Type className="w-3.5 h-3.5" />}
                                width="w-32"
                                items={EMAIL_SIZES.map((s) => ({
                                    key: s.px,
                                    label: s.label,
                                    style: { fontSize: s.px },
                                }))}
                                onPick={(px) => {
                                    // execCommand("fontSize") só aceita 1-7; aplicamos px
                                    // no elemento gerado pra bater com o Gmail.
                                    exec("fontSize", "7");
                                    const editor = editorRef.current;
                                    editor?.querySelectorAll('font[size="7"]').forEach((el) => {
                                        el.removeAttribute("size");
                                        (el as HTMLElement).style.fontSize = px;
                                    });
                                    emit();
                                }}
                            />
                            <Divider />
                            <ToolbarButton onClick={() => exec("bold")} title="Negrito (Ctrl+B)">
                                <Bold className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("italic")} title="Itálico (Ctrl+I)">
                                <Italic className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("underline")} title="Sublinhado (Ctrl+U)">
                                <Underline className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("strikeThrough")} title="Tachado">
                                <Strikethrough className="w-4 h-4" />
                            </ToolbarButton>
                            <ColorMenu onPick={(color) => exec("foreColor", color)} />
                            <Divider />
                            <ToolbarButton onClick={() => exec("justifyLeft")} title="Alinhar à esquerda">
                                <AlignLeft className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("justifyCenter")} title="Centralizar">
                                <AlignCenter className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("justifyRight")} title="Alinhar à direita">
                                <AlignRight className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("justifyFull")} title="Justificar">
                                <AlignJustify className="w-4 h-4" />
                            </ToolbarButton>
                            <Divider />
                            <ToolbarButton onClick={() => exec("insertUnorderedList")} title="Lista com marcadores">
                                <List className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("insertOrderedList")} title="Lista numerada">
                                <ListOrdered className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("outdent")} title="Diminuir recuo">
                                <Outdent className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton onClick={() => exec("indent")} title="Aumentar recuo">
                                <Indent className="w-4 h-4" />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => exec("formatBlock", "blockquote")}
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
                    <ToolbarButton onClick={handleLink} title="Inserir link (Ctrl+K)">
                        <Link2 className="w-4 h-4" />
                    </ToolbarButton>
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
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            type="button"
            // onMouseDown preventDefault mantém a seleção do texto viva: sem
            // isso o clique tira o foco do editor e o comando não acha o alvo.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            title={title}
            aria-label={title}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
            {children}
        </button>
    );
}

function ToolbarToggle({
    children,
    onClick,
    title,
    active,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
    active: boolean;
}) {
    return (
        <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            title={title}
            aria-label={title}
            aria-pressed={active}
            className={cn(
                "p-1.5 rounded transition-colors",
                active
                    ? "bg-brand-500/20 text-brand-600 dark:text-brand-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function SelectMenu({
    label,
    icon,
    items,
    onPick,
    width,
}: {
    label: string;
    icon?: React.ReactNode;
    items: { key: string; label: string; style?: React.CSSProperties }[];
    onPick: (key: string) => void;
    width: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
                {icon}
                <span className="max-w-[86px] truncate">{label}</span>
                <ChevronDown className="w-3 h-3" />
            </button>
            {open && (
                <div
                    className={cn(
                        "absolute bottom-full left-0 z-50 mb-1 rounded-lg border border-border bg-popover shadow-lg py-1 max-h-64 overflow-y-auto",
                        width,
                    )}
                >
                    {items.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onPick(item.key); setOpen(false); }}
                            style={item.style}
                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ColorMenu({ onPick }: { onPick: (color: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen((v) => !v)}
                title="Cor do texto"
                aria-label="Cor do texto"
                className="flex items-center gap-0.5 p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
                <span className="font-bold text-sm leading-none">A</span>
                <ChevronDown className="w-3 h-3" />
            </button>
            {open && (
                <div className="absolute bottom-full left-0 z-50 mb-1 grid grid-cols-6 gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg">
                    {EMAIL_COLORS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onPick(color); setOpen(false); }}
                            title={color}
                            aria-label={`Cor ${color}`}
                            style={{ backgroundColor: color }}
                            className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
