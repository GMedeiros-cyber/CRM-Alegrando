"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    getClienteByTelefone,
    updateCliente,
    toggleIaAtiva,
} from "@/lib/actions/leads";
import { sendMessageToN8n } from "@/lib/actions/messages";
import { getPasseiosDoLead } from "@/lib/actions/kanban";
import type { PasseioRealizado } from "@/lib/actions/kanban";
import type { ClienteDetail } from "@/lib/actions/leads";
import { ChatWindow } from "@/components/conversas/chat-window";
import {
    Save,
    Loader2,
    Bot,
    UserRound,
    Send,
    CheckCircle2,
    AlertCircle,
    Phone,
    User,
    Mail,
    MapPin,
    CalendarDays,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadDetailSheetProps {
    telefone: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved?: () => void;
}

export function LeadDetailSheet({
    telefone,
    open,
    onOpenChange,
    onSaved,
}: LeadDetailSheetProps) {
    const [cliente, setCliente] = useState<ClienteDetail | null>(null);
    const [loadingCliente, setLoadingCliente] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Form state
    const [form, setForm] = useState({
        nome: "",
        email: "",
        cpf: "",
        status: "",
        statusAtendimento: "",
    });

    // Chat
    const [chatMessage, setChatMessage] = useState("");

    // Passeios
    const [passeios, setPasseios] = useState<PasseioRealizado[]>([]);
    const [showAllPasseios, setShowAllPasseios] = useState(false);

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Load cliente data when opened
    const loadCliente = useCallback(async () => {
        if (!telefone) return;
        setLoadingCliente(true);
        try {
            const clienteData = await getClienteByTelefone(telefone);

            if (clienteData) {
                setCliente(clienteData);
                setForm({
                    nome: clienteData.nome || "",
                    email: clienteData.email || "",
                    cpf: clienteData.cpf || "",
                    status: clienteData.status || "",
                    statusAtendimento: clienteData.statusAtendimento || "",
                });
                // Carregar passeios
                const tel = parseInt(clienteData.telefone, 10);
                if (!isNaN(tel)) {
                    const p = await getPasseiosDoLead(tel);
                    setPasseios(p);
                }
            }
        } catch (err) {
            setToast({ type: "error", text: `Erro ao carregar cliente: ${err}` });
        } finally {
            setLoadingCliente(false);
        }
    }, [telefone]);

    useEffect(() => {
        if (open && telefone) loadCliente();
    }, [open, telefone, loadCliente]);

    // Handlers
    function handleSave() {
        if (!telefone) return;
        startTransition(async () => {
            try {
                await updateCliente(telefone, {
                    nome: form.nome || null,
                    email: form.email || null,
                    cpf: form.cpf || null,
                    status: form.status || null,
                    statusAtendimento: form.statusAtendimento || null,
                });
                setToast({ type: "success", text: "Cliente atualizado!" });
                onSaved?.();
            } catch (err) {
                setToast({ type: "error", text: `Erro ao salvar: ${err}` });
            }
        });
    }

    function handleToggleIA() {
        if (!telefone || !cliente) return;
        const newVal = !cliente.iaAtiva;
        startTransition(async () => {
            try {
                await toggleIaAtiva(telefone, newVal);
                setCliente((prev) => (prev ? { ...prev, iaAtiva: newVal } : null));
                setToast({
                    type: "success",
                    text: newVal
                        ? "IA reativada — n8n voltará a responder automaticamente."
                        : "IA pausada — equipe assumiu o atendimento.",
                });
            } catch (err) {
                setToast({ type: "error", text: `Erro ao alterar IA: ${err}` });
            }
        });
    }

    function handleSendMessage() {
        if (!cliente?.telefone || !chatMessage.trim()) return;
        const text = chatMessage.trim();
        setChatMessage("");

        startTransition(async () => {
            try {
                await sendMessageToN8n({
                    telefone: cliente.telefone,
                    mensagem: text,
                    sender_name: "Equipe",
                });
            } catch (err) {
                setToast({ type: "error", text: `Erro ao enviar via n8n: ${err}` });
            }
        });
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[900px] p-0 overflow-hidden flex flex-col"
            >
                {/* Header */}
                <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="font-display text-xl font-bold text-foreground">
                            {cliente?.nome || cliente?.telefone || "Carregando..."}
                        </SheetTitle>
                    </div>
                </SheetHeader>

                {/* Toast */}
                {toast && (
                    <div
                        className={cn(
                            "mx-6 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border shrink-0",
                            toast.type === "success"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-red-50 text-red-800 border-red-200"
                        )}
                    >
                        {toast.type === "success" ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        {toast.text}
                    </div>
                )}

                {loadingCliente ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                    </div>
                ) : cliente ? (
                    <div className="flex-1 flex overflow-hidden">
                        {/* =================== LEFT SIDE: FORM =================== */}
                        <div className="w-[55%] border-r border-border/30 overflow-y-auto p-6 space-y-5">
                            {/* Nome */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" />
                                    Nome
                                </Label>
                                <Input
                                    value={form.nome}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, nome: e.target.value }))
                                    }
                                    className="rounded-xl"
                                />
                            </div>

                            {/* Telefone (readonly) */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5" />
                                    Telefone
                                </Label>
                                <Input
                                    value={cliente.telefone}
                                    disabled
                                    className="rounded-xl bg-muted/50 cursor-not-allowed"
                                />
                            </div>

                            {/* Email + CPF */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        ✉️ Email
                                    </Label>
                                    <Input
                                        value={form.email}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, email: e.target.value }))
                                        }
                                        placeholder="contato@exemplo.com"
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        🪪 CPF
                                    </Label>
                                    <Input
                                        value={form.cpf}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, cpf: e.target.value }))
                                        }
                                        placeholder="000.000.000-00"
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>

                            {/* Status + Status Atendimento */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        📋 Status
                                    </Label>
                                    <Input
                                        value={form.status}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, status: e.target.value }))
                                        }
                                        placeholder="Ex: Lead, Cliente"
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        🔄 Atendimento
                                    </Label>
                                    <Input
                                        value={form.statusAtendimento}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, statusAtendimento: e.target.value }))
                                        }
                                        placeholder="Ex: Ativo"
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>

                            {/* Save button */}
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-md shadow-brand-500/20"
                            >
                                {isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Salvar Alterações
                            </button>

                            {/* Passeios Realizados */}
                            <div className="pt-4 border-t border-border/30">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    Passeios Realizados
                                    {passeios.length > 0 && (
                                        <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                                            {passeios.length}
                                        </span>
                                    )}
                                </h4>
                                {passeios.length === 0 ? (
                                    <p className="text-xs text-muted-foreground/60 italic">
                                        Nenhum passeio realizado ainda.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {(showAllPasseios ? passeios : passeios.slice(0, 3)).map((p) => {
                                            const [y, m, d] = p.dataPasseio.split("-");
                                            const formatted = `${d}/${m}/${y}`;
                                            const [cy, cm, cd] = p.createdAt.split("T")[0].split("-");
                                            const createdFormatted = `${cd}/${cm}/${cy}`;
                                            return (
                                                <div
                                                    key={p.id}
                                                    className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                        <span className="text-sm font-semibold text-emerald-800">
                                                            {formatted}
                                                        </span>
                                                    </div>
                                                    {p.destino && (
                                                        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                                            <MapPin className="w-3 h-3" />
                                                            {p.destino}
                                                        </p>
                                                    )}
                                                    <p className="text-[10px] text-emerald-500/70 mt-0.5">
                                                        Confirmado em {createdFormatted}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        {passeios.length > 3 && !showAllPasseios && (
                                            <button
                                                onClick={() => setShowAllPasseios(true)}
                                                className="w-full flex items-center justify-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium py-1.5 transition-colors"
                                            >
                                                <ChevronDown className="w-3.5 h-3.5" />
                                                Ver todos ({passeios.length})
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* =================== RIGHT SIDE: CHAT =================== */}
                        <div className="w-[45%] flex flex-col bg-surface-subtle/30">
                            {/* AI Toggle */}
                            <div className="px-4 py-3 border-b border-border/30 shrink-0">
                                <div
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-xl border transition-colors",
                                        cliente.iaAtiva
                                            ? "bg-emerald-50/80 border-emerald-200"
                                            : "bg-orange-50/80 border-orange-200"
                                    )}
                                >
                                    <div className="flex items-center gap-2.5">
                                        {cliente.iaAtiva ? (
                                            <Bot className="w-5 h-5 text-emerald-600" />
                                        ) : (
                                            <UserRound className="w-5 h-5 text-orange-600" />
                                        )}
                                        <div>
                                            <p
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    cliente.iaAtiva ? "text-emerald-800" : "text-orange-800"
                                                )}
                                            >
                                                {cliente.iaAtiva ? "IA Ativa" : "Atendimento Manual"}
                                            </p>
                                            <p
                                                className={cn(
                                                    "text-[11px]",
                                                    cliente.iaAtiva
                                                        ? "text-emerald-600"
                                                        : "text-orange-600"
                                                )}
                                            >
                                                {cliente.iaAtiva
                                                    ? "n8n responde automaticamente"
                                                    : "Equipe assumiu o chat"}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={cliente.iaAtiva}
                                        onCheckedChange={handleToggleIA}
                                        disabled={isPending}
                                        className="data-[state=checked]:bg-emerald-500"
                                    />
                                </div>
                            </div>

                            {/* Chat messages — Realtime via Supabase */}
                            <ChatWindow telefone={cliente.telefone} />

                            {/* Chat input */}
                            <div className="px-4 py-3 border-t border-border/30 shrink-0">
                                <div className="flex gap-2">
                                    <Input
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                        placeholder={
                                            cliente.iaAtiva
                                                ? "Pausar IA antes de enviar..."
                                                : "Digite uma mensagem..."
                                        }
                                        className="rounded-xl flex-1"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={isPending || !chatMessage.trim()}
                                        className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm shrink-0"
                                    >
                                        {isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
                                    Mensagens são disparadas via n8n → WhatsApp
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
