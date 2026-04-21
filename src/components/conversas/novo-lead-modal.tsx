"use client";

import { useState, useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCliente } from "@/lib/actions/leads";
import { uploadContactPhoto } from "@/lib/actions/messages";
import { cn } from "@/lib/utils";
import { Phone, User, UserRound, UserPlus, Plus, X, Loader2, Cake } from "lucide-react";

interface NovoLeadModalProps {
    onClose: () => void;
    onCreated: (telefone: string) => void;
    onToast: (toast: { type: "success" | "error"; text: string }) => void;
}

export function NovoLeadModal({ onClose, onCreated, onToast }: NovoLeadModalProps) {
    const [newLeadForm, setNewLeadForm] = useState({ telefone: "", nome: "" });
    const [newLeadCanal, setNewLeadCanal] = useState<"alegrando" | "festas">("alegrando");
    const [newLeadResponsavel, setNewLeadResponsavel] = useState("");
    const [aniversariante, setAniversariante] = useState("");
    const [newLeadPhoto, setNewLeadPhoto] = useState<{ file: File; preview: string } | null>(null);
    const newLeadPhotoRef = useRef<HTMLInputElement>(null);
    const [isCreatingLead, startCreatingLead] = useTransition();

    function resetAndClose() {
        setNewLeadPhoto(null);
        setNewLeadForm({ telefone: "", nome: "" });
        setNewLeadCanal("alegrando");
        setNewLeadResponsavel("");
        setAniversariante("");
        onClose();
    }

    function handleCreateLead() {
        const tel = newLeadForm.telefone.replace(/\D/g, "").trim();
        if (!tel || tel.length < 8) {
            onToast({ type: "error", text: "Telefone inválido." });
            return;
        }
        startCreatingLead(async () => {
            try {
                let fotoUrl: string | null = null;

                // Upload photo via server action if selected
                if (newLeadPhoto) {
                    const fd = new FormData();
                    fd.append("file", newLeadPhoto.file);
                    fd.append("telefone", tel);
                    const uploadResult = await uploadContactPhoto(fd);
                    if (uploadResult.success && uploadResult.url) {
                        fotoUrl = uploadResult.url;
                    } else {
                        onToast({ type: "error", text: `Foto não salva: ${uploadResult.error || "erro desconhecido"}` });
                    }
                }

                await createCliente({
                    telefone: tel,
                    nome: newLeadForm.nome.trim() || null,
                    fotoUrl,
                    canal: newLeadCanal,
                    responsavel: newLeadResponsavel.trim() || null,
                    aniversariante: newLeadCanal === "festas" ? (aniversariante.trim() || null) : null,
                });
                setNewLeadForm({ telefone: "", nome: "" });
                setNewLeadCanal("alegrando");
                setNewLeadResponsavel("");
                setAniversariante("");
                setNewLeadPhoto(null);
                onToast({ type: "success", text: "Lead criado com sucesso!" });
                onClose();
                onCreated(tel);
            } catch (err) {
                onToast({ type: "error", text: `Erro ao criar lead: ${err}` });
            }
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191918]/30 dark:bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#F7F7F5] dark:bg-[#0f1829] border-2 border-[#C7D2FE] dark:border-[#3d4a60] rounded-2xl shadow-2xl w-[380px] max-w-[90vw] p-6 animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                            <UserPlus className="w-4 h-4 text-brand-400" />
                        </div>
                        <h3 className="font-display text-base font-bold text-[#191918] dark:text-white">
                            Novo Lead
                        </h3>
                    </div>
                    <button
                        onClick={resetAndClose}
                        className="p-1.5 rounded-lg hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Avatar picker */}
                <div className="flex justify-center mb-4">
                    <input
                        ref={newLeadPhotoRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setNewLeadPhoto({ file, preview: URL.createObjectURL(file) });
                            e.target.value = "";
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => newLeadPhotoRef.current?.click()}
                        className="relative w-20 h-20 rounded-full border-2 border-dashed border-[#A5B4FC] dark:border-[#4a5568] hover:border-brand-500 bg-[#EEF2FF] dark:bg-[#1e2536]/60 hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] transition-colors overflow-hidden group"
                        title="Adicionar foto"
                    >
                        {newLeadPhoto ? (
                            <>
                                <img src={newLeadPhoto.preview} alt="foto" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-[#191918]/20 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Plus className="w-5 h-5 text-[#191918] dark:text-white" />
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-1 h-full text-[#6366F1] dark:text-[#94a3b8] group-hover:text-brand-400 transition-colors">
                                <Plus className="w-6 h-6" />
                                <span className="text-[10px] font-medium">Foto</span>
                            </div>
                        )}
                    </button>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            Telefone *
                        </Label>
                        <Input
                            value={newLeadForm.telefone}
                            onChange={(e) => setNewLeadForm((f) => ({ ...f, telefone: e.target.value }))}
                            placeholder="5511999999999"
                            className="rounded-lg h-9 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Nome
                        </Label>
                        <Input
                            value={newLeadForm.nome}
                            onChange={(e) => setNewLeadForm((f) => ({ ...f, nome: e.target.value }))}
                            placeholder="Nome do contato (opcional)"
                            className="rounded-lg h-9 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:text-[#94a3b8]"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateLead();
                            }}
                        />
                    </div>
                    {newLeadCanal !== "festas" && (
                        <div className="space-y-1">
                            <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                                <UserRound className="w-3 h-3" />
                                Responsável
                            </Label>
                            <Input
                                value={newLeadResponsavel}
                                onChange={(e) => setNewLeadResponsavel(e.target.value)}
                                placeholder="Nome do responsável"
                                className="rounded-lg h-9 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#64748b]"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateLead();
                                }}
                            />
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                            Canal
                        </Label>
                        <div className="flex gap-2">
                            {(["alegrando", "festas"] as const).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setNewLeadCanal(c)}
                                    className={cn(
                                        "flex-1 h-8 rounded-lg text-xs font-semibold border-2 transition-colors",
                                        newLeadCanal === c
                                            ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                                            : "bg-[#EEF2FF] dark:bg-[#1e2536]/40 text-[#6366F1] dark:text-[#94a3b8] border-[#C7D2FE] dark:border-[#3d4a60]/40 hover:text-[#37352F] dark:hover:text-[#cbd5e1]"
                                    )}
                                >
                                    {c === "alegrando" ? "🎒 Alegrando" : "🎉 Festas"}
                                </button>
                            ))}
                        </div>
                    </div>
                    {newLeadCanal === "festas" && (
                        <div className="space-y-1">
                            <Label className="text-[10px] font-semibold text-[#37352F] dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-1">
                                <Cake className="w-3 h-3" />
                                Aniversariante
                            </Label>
                            <Input
                                value={aniversariante}
                                onChange={(e) => setAniversariante(e.target.value)}
                                placeholder="Nome do aniversariante (opcional)"
                                className="rounded-lg h-9 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white placeholder:text-[#6366F1] dark:placeholder:text-[#64748b]"
                            />
                        </div>
                    )}
                </div>

                <div className="flex gap-2 mt-5">
                    <button
                        onClick={resetAndClose}
                        className="flex-1 h-9 rounded-lg border border-[#A5B4FC] dark:border-[#4a5568] text-sm font-medium text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreateLead}
                        disabled={isCreatingLead || !newLeadForm.telefone.trim()}
                        className="flex-1 h-9 rounded-lg bg-brand-500 text-[#191918] dark:text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-lg shadow-brand-500/25 flex items-center justify-center gap-1.5"
                    >
                        {isCreatingLead ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Plus className="w-3.5 h-3.5" />
                                Criar Lead
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
