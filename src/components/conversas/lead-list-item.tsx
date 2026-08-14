"use client";

import { memo } from "react";
import Image from "next/image";
import { Mail, Star, Users } from "lucide-react";
import type { ClienteListItem } from "@/lib/actions/leads";
import { cn, isValidPhotoUrl } from "@/lib/utils";
import { LabelBadge } from "@/components/labels/label-badge";

function isRecentlyCreated(createdAt: Date | null): boolean {
    if (!createdAt) return false;
    return Date.now() - new Date(createdAt).getTime() < 60_000;
}

function formatLastMessageTime(date: Date | null): string {
    if (!date) return "";
    const now = new Date();
    const d = new Date(date);

    // Comparar dias-calendário no timezone local (não ms brutos)
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dMidnight    = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
    const diffDays = Math.round(
        (todayMidnight.getTime() - dMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Ontem";
    if (diffDays <= 6) {
        const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        return dias[d.getDay()];
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface LeadListItemProps {
    item: ClienteListItem;
    isSelected: boolean;
    onClick: () => void;
    tick: number;
    onToggleFavorito: () => void;
}

export function isGroupTelefone(telefone: string | number): boolean {
    const s = String(telefone);
    if (s.endsWith("-group")) return true;
    // IDs de grupos do WhatsApp começam com 120363 e têm 18+ dígitos.
    // Antes da migration que mudou a coluna para TEXT, eles eram salvos
    // como numeric (com 55 prefixado por engano), então também detectamos
    // por esse padrão para não perder o badge.
    const digits = s.replace(/\D/g, "");
    if (digits.startsWith("120363") && digits.length >= 18) return true;
    if (digits.startsWith("55120363") && digits.length >= 20) return true;
    return false;
}

const LeadListItemInner = function LeadListItem({
    item,
    isSelected,
    onClick,
    onToggleFavorito,
}: LeadListItemProps) {
    const telefoneStr = String(item.telefone);
    const isGroup = isGroupTelefone(item.telefone);
    return (
        /**
         * A estrela é IRMÃ do card, não filha.
         *
         * O card é um `<button>` de verdade, e botão dentro de botão é HTML
         * inválido — o React avisa, e o comportamento de teclado fica
         * imprevisível. As alternativas seriam rebaixar o card a
         * `div role="button"` (perdendo Enter/Espaço nativos na ação que é
         * usada cem vezes mais) ou aninhar mesmo assim.
         *
         * Sendo irmãos posicionados, os dois continuam `<button>` nativos: cada
         * um com seu foco, seu Enter e seu Espaço, e o clique na estrela nem
         * chega perto do card — não é propagação contida, é evento em outro
         * elemento. A ordem no DOM deixa o card primeiro, então o Tab alcança
         * abrir a conversa antes de favoritar.
         */
        <div className="relative">
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 border-2",
                isSelected
                    ? "bg-card border-brand-500 shadow-lg shadow-brand-500/15"
                    : "bg-card/60 border-border/50 hover:bg-card hover:border-muted-foreground/40"
            )}
        >
            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={cn(
                    "w-9 h-9 rounded-full shrink-0 border overflow-hidden flex items-center justify-center text-sm font-bold",
                    isGroup
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                        : "bg-[#E0E7FF] dark:bg-[#2d3347] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white"
                )}>
                    {isValidPhotoUrl(item.fotoUrl) ? (
                        <Image
                            src={item.fotoUrl}
                            alt={item.nome || "avatar"}
                            width={36}
                            height={36}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                                const fallback = e.currentTarget.parentElement;
                                if (fallback) fallback.textContent = (item.nome || telefoneStr).charAt(0).toUpperCase();
                            }}
                            unoptimized={item.fotoUrl.includes("pps.whatsapp.net")}
                        />
                    ) : isGroup ? (
                        <Users className="w-4 h-4" />
                    ) : (
                        (item.nome || telefoneStr).charAt(0).toUpperCase()
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                        <p className={cn(
                            "text-sm font-bold truncate",
                            isSelected
                                ? "text-brand-400"
                                : "text-[#191918] dark:text-white"
                        )}>
                            {item.nome || telefoneStr}
                        </p>
                        <span className="text-[10px] text-[#6366F1] dark:text-[#94a3b8] shrink-0 ml-auto">
                            {formatLastMessageTime(item.lastMessageAt)}
                        </span>
                        {item.unreadCount > 0 && (
                            <span
                                title={`${item.unreadCount} mensagem(ns) de WhatsApp não lida(s)`}
                                className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-[#191918] dark:text-white text-[10px] font-bold flex items-center justify-center shrink-0 animate-in zoom-in-50"
                            >
                                {item.unreadCount > 99 ? "99+" : item.unreadCount}
                            </span>
                        )}
                        {/* Verde, e com o ícone de envelope: ao lado do contador
                            do WhatsApp, só o número não diria de onde veio. */}
                        {item.emailUnreadCount > 0 && (
                            <span
                                title={`${item.emailUnreadCount} resposta(s) de e-mail não lida(s)`}
                                className="min-w-[18px] h-[18px] px-1 gap-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 animate-in zoom-in-50"
                            >
                                <Mail className="w-2.5 h-2.5" />
                                {item.emailUnreadCount > 99 ? "99+" : item.emailUnreadCount}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] font-mono text-[#191918] dark:text-white font-medium truncate mt-0.5">
                        {isGroup ? "Grupo WhatsApp" : telefoneStr}
                    </p>
                </div>
            </div>
            {/* `pl-8` reserva a quina inferior esquerda para a estrela, que é
                irmã deste botão e flutua por cima. Sem a reserva, um lead com
                três tags + "Grupo" + "Manual" enche a linha, quebra pra
                esquerda e passa por baixo do ícone. */}
            <div className="mt-2 flex flex-wrap justify-end gap-1.5 min-h-[20px] pl-8">
                {item.statusAtendimento === "novo" && isRecentlyCreated(item.createdAt) && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        NOVO
                    </span>
                )}
                {isGroup && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 border border-emerald-400">
                        Grupo
                    </span>
                )}
                {!isGroup && !item.iaAtiva && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-800 border border-orange-400">
                        Manual
                    </span>
                )}
                {/* Tags: limita a 3 visíveis, "+N" no excedente */}
                {item.labels.slice(0, 3).map((l) => (
                    <LabelBadge key={l.id} name={l.name} color={l.color} size="sm" />
                ))}
                {item.labels.length > 3 && (
                    <span
                        title={item.labels.slice(3).map((l) => l.name).join(", ")}
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#C7D2FE] dark:bg-[#3d4a60]/60 text-[#37352F] dark:text-[#cbd5e1] border border-[#A5B4FC] dark:border-[#4a5568]"
                    >
                        +{item.labels.length - 3}
                    </span>
                )}
            </div>
        </button>

        {/* Ancorada na BASE do card, não a uma distância fixa do topo.
            O `top-[50px]` de antes era medido a partir do avatar e não sabia
            onde o card terminava: num lead sem tag nenhuma o card tem 88px e a
            estrela ia parar depois da borda, encostando no card seguinte — era
            o "cortado". Preso ao rodapé, ela fica dentro do card em qualquer
            altura, e cai na faixa das tags, que é alinhada à direita e tem a
            quina esquerda livre (reservada com `pl-8` acima). */}
        <button
            type="button"
            onClick={onToggleFavorito}
            aria-pressed={item.favorito}
            aria-label={
                item.favorito
                    ? `Desfavoritar ${item.nome || telefoneStr}`
                    : `Favoritar ${item.nome || telefoneStr}`
            }
            title={item.favorito ? "Remover dos favoritos" : "Marcar como favorito"}
            className={cn(
                "absolute bottom-2.5 left-2.5 flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                "hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                item.favorito
                    ? "text-amber-500"
                    : "text-[#9B9A97] dark:text-[#64748b] hover:text-amber-500",
            )}
        >
            <Star className={cn("h-3.5 w-3.5", item.favorito && "fill-current")} />
        </button>
        </div>
    );
};

export const LeadListItem = memo(LeadListItemInner);
