"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ChevronRight,
    FileText,
    Folder,
    HardDrive,
    Loader2,
    Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { attachDriveFile, listDriveFiles } from "@/lib/actions/emails";
import type { DriveFile, EmailAttachment } from "@/lib/types/email";

export interface DrivePickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAttach: (attachment: EmailAttachment) => void;
    onError: (message: string) => void;
}

/**
 * Seletor de arquivos do Drive da Alegrando.
 *
 * Não é o Picker nativo do Google de propósito: aquele exige o login Google de
 * cada usuária no navegador e mostraria o Drive PESSOAL dela. Aqui a listagem
 * é server-side com a credencial da empresa, então todo mundo vê o mesmo
 * Drive — o da Alegrando — e nada de OAuth aparece pra elas.
 */
export function DrivePickerModal(props: DrivePickerModalProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col gap-3 overflow-hidden">
                <DriveBrowser {...props} />
            </DialogContent>
        </Dialog>
    );
}

type Crumb = { id: string | null; name: string };

function DriveBrowser({ onOpenChange, onAttach, onError }: DrivePickerModalProps) {
    const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "Meu Drive" }]);
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [state, setState] = useState<
        { loading: true } | { loading: false; files: DriveFile[]; error: string }
    >({ loading: true });
    const [attaching, setAttaching] = useState<string | null>(null);

    const current = crumbs[crumbs.length - 1];

    // Espera a digitação parar: cada tecla dispararia uma chamada ao Drive.
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);

    const requestKey = `${current.id ?? "root"}|${debounced}`;
    useEffect(() => {
        let cancelled = false;
        const [folder, term] = requestKey.split("|");
        listDriveFiles({
            folderId: folder === "root" ? null : folder,
            search: term || undefined,
        })
            .then((res) => {
                if (cancelled) return;
                setState(
                    res.ok
                        ? { loading: false, files: res.files, error: "" }
                        : { loading: false, files: [], error: res.error },
                );
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setState({
                    loading: false,
                    files: [],
                    error: err instanceof Error ? err.message : "Erro ao ler o Drive.",
                });
            });
        return () => { cancelled = true; };
    }, [requestKey]);

    const files = useMemo(() => (state.loading ? [] : state.files), [state]);

    async function handlePick(file: DriveFile) {
        if (file.isFolder) {
            setSearch("");
            setDebounced("");
            setState({ loading: true });
            setCrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
            return;
        }

        setAttaching(file.id);
        try {
            const res = await attachDriveFile(file.id);
            if (!res.ok) {
                onError(res.error);
                return;
            }
            onAttach(res.attachment);
            onOpenChange(false);
        } finally {
            setAttaching(null);
        }
    }

    function goTo(index: number) {
        setSearch("");
        setDebounced("");
        setState({ loading: true });
        setCrumbs((prev) => prev.slice(0, index + 1));
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    Arquivos do Drive
                </DialogTitle>
                <DialogDescription>
                    Drive da Alegrando. O arquivo escolhido é anexado ao e-mail — quem
                    recebe não precisa de permissão nenhuma.
                </DialogDescription>
            </DialogHeader>

            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar em todo o Drive..."
                    className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                />
            </div>

            {!debounced && (
                <nav className="flex items-center gap-0.5 text-xs text-muted-foreground flex-wrap">
                    {crumbs.map((crumb, index) => (
                        <span key={`${crumb.id ?? "root"}-${index}`} className="flex items-center gap-0.5">
                            {index > 0 && <ChevronRight className="w-3 h-3" />}
                            <button
                                type="button"
                                onClick={() => goTo(index)}
                                disabled={index === crumbs.length - 1}
                                className={cn(
                                    "max-w-[140px] truncate hover:text-foreground transition-colors",
                                    index === crumbs.length - 1 && "text-foreground font-medium",
                                )}
                            >
                                {crumb.name}
                            </button>
                        </span>
                    ))}
                </nav>
            )}

            <div className="flex-1 min-h-[200px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {state.loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando...
                    </div>
                ) : state.error ? (
                    <p className="p-4 text-sm text-red-600 dark:text-red-400">{state.error}</p>
                ) : files.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground italic">
                        {debounced ? "Nada encontrado." : "Pasta vazia."}
                    </p>
                ) : (
                    files.map((file) => (
                        <button
                            key={file.id}
                            type="button"
                            onClick={() => void handlePick(file)}
                            disabled={attaching !== null}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                        >
                            {attaching === file.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-brand-500 shrink-0" />
                            ) : file.isFolder ? (
                                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                            ) : (
                                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="flex-1 min-w-0 text-sm truncate">{file.name}</span>
                            {file.size !== null && !file.isFolder && (
                                <span className="text-[11px] text-muted-foreground shrink-0">
                                    {file.size < 1024 * 1024
                                        ? `${(file.size / 1024).toFixed(0)} KB`
                                        : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                                </span>
                            )}
                            {file.isFolder && (
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                        </button>
                    ))
                )}
            </div>

            <div className="flex justify-end pt-1">
                <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                    Fechar
                </button>
            </div>
        </>
    );
}
