"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Check, Crop, Eraser, Pencil, RotateCcw, RotateCw, Trash2, Undo2, X,
} from "lucide-react";
import { EmojiPickerInput } from "./emoji-picker-input";

/**
 * Editor de imagem da bandeja de anexos — cortar, girar e desenhar antes de
 * enviar. Vive fora do `conversas-layout.tsx` de propósito: aquele arquivo já
 * tem 2190 linhas.
 *
 * Duas decisões que não são estilo, são o que faz o editor funcionar:
 *
 * 1. **Duas camadas de canvas.** A imagem fica no canvas de baixo e os traços
 *    no de cima. A borracha é `destination-out` na camada DE CIMA — se os dois
 *    fossem um canvas só, ela apagaria a foto junto.
 * 2. **Desfazer guarda a LISTA de traços, não pixels.** Snapshot por traço
 *    estoura memória num print grande e não sobrevive a girar/cortar: girar
 *    redesenha tudo a partir da lista.
 */

export type Traco = {
    pontos: { x: number; y: number }[];
    cor: string;
    espessura: number;
    borracha: boolean;
};

export type EditState = {
    rotacao: 0 | 90 | 180 | 270;
    /** Em pixels da imagem JÁ ROTACIONADA. Null = sem corte. */
    corte: { x: number; y: number; w: number; h: number } | null;
    tracos: Traco[];
};

export const EDIT_STATE_VAZIO: EditState = { rotacao: 0, corte: null, tracos: [] };

/** Nada mexido? O `File` original passa direto, sem canvas e sem re-encode. */
export function houveEdicao(e: EditState): boolean {
    return e.rotacao !== 0 || e.corte !== null || e.tracos.length > 0;
}

export interface ImageEditorProps {
    file: File;
    legendaInicial: string;
    estadoInicial?: EditState | null;
    onSalvar: (r: { file: File; legenda: string; estado: EditState }) => void;
    onCancelar: () => void;
}

// Qualidade EXPLÍCITA: herdar o default do navegador faz o resultado variar por
// browser e por versão, e isso só aparece quando alguém compara dois envios.
const JPEG_Q = 0.92;
const PNG_Q = 1.0;

const CORES = ["#EF4444", "#F59E0B", "#22C55E", "#6366F1", "#191918", "#FFFFFF"];
const ESPESSURAS = [3, 6, 12];

export function ImageEditor({
    file, legendaInicial, estadoInicial, onSalvar, onCancelar,
}: ImageEditorProps) {
    const baseRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const [pronto, setPronto] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [legenda, setLegenda] = useState(legendaInicial);

    const [rotacao, setRotacao] = useState<EditState["rotacao"]>(estadoInicial?.rotacao ?? 0);
    const [corte, setCorte] = useState<EditState["corte"]>(estadoInicial?.corte ?? null);
    const [tracos, setTracos] = useState<Traco[]>(estadoInicial?.tracos ?? []);

    const [cor, setCor] = useState(CORES[0]);
    const [espessura, setEspessura] = useState(ESPESSURAS[1]);
    const [borracha, setBorracha] = useState(false);
    const [modoCorte, setModoCorte] = useState(false);
    const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const tracoAtual = useRef<Traco | null>(null);
    const arrastando = useRef(false);

    // ---- carregar a imagem uma vez ----
    useEffect(() => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { imgRef.current = img; setPronto(true); };
        img.onerror = () => setErro("Não deu para abrir esta imagem.");
        img.src = url;
        return () => URL.revokeObjectURL(url);
    }, [file]);

    /** Desenha a imagem na camada de baixo, aplicando rotação e corte. */
    const redesenharBase = useCallback(() => {
        const img = imgRef.current, base = baseRef.current, draw = drawRef.current;
        if (!img || !base || !draw) return;

        const girado = rotacao === 90 || rotacao === 270;
        const lw = girado ? img.height : img.width;
        const lh = girado ? img.width : img.height;

        const tmp = document.createElement("canvas");
        tmp.width = lw; tmp.height = lh;
        const tc = tmp.getContext("2d")!;
        tc.translate(lw / 2, lh / 2);
        tc.rotate((rotacao * Math.PI) / 180);
        tc.drawImage(img, -img.width / 2, -img.height / 2);

        const c = corte ?? { x: 0, y: 0, w: lw, h: lh };
        base.width = c.w; base.height = c.h;
        draw.width = c.w; draw.height = c.h;
        base.getContext("2d")!.drawImage(tmp, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    }, [rotacao, corte]);

    useEffect(() => { if (pronto) redesenharBase(); }, [pronto, redesenharBase]);

    // ---- camada de traços: redesenhada inteira a partir da lista ----
    useEffect(() => {
        const cv = drawRef.current; if (!cv || !pronto) return;
        const ctx = cv.getContext("2d")!;
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (const t of tracos) {
            ctx.globalCompositeOperation = t.borracha ? "destination-out" : "source-over";
            ctx.strokeStyle = t.cor;
            ctx.lineWidth = t.espessura;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            t.pontos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            if (t.pontos.length === 1) ctx.lineTo(t.pontos[0].x + 0.1, t.pontos[0].y);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
    }, [tracos, pronto, rotacao, corte]);

    /** Converte coordenada de ponteiro para pixel do canvas (que é escalado por CSS). */
    function paraCanvas(e: React.PointerEvent) {
        const cv = drawRef.current!;
        const r = cv.getBoundingClientRect();
        return {
            x: ((e.clientX - r.left) / r.width) * cv.width,
            y: ((e.clientY - r.top) / r.height) * cv.height,
        };
    }

    function onDown(e: React.PointerEvent) {
        if (!pronto) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const p = paraCanvas(e);
        arrastando.current = true;
        if (modoCorte) { setSel({ x: p.x, y: p.y, w: 0, h: 0 }); return; }
        tracoAtual.current = { pontos: [p], cor, espessura, borracha };
        setTracos((t) => [...t, tracoAtual.current!]);
    }

    function onMove(e: React.PointerEvent) {
        if (!arrastando.current) return;
        const p = paraCanvas(e);
        if (modoCorte) {
            setSel((s) => (s ? { ...s, w: p.x - s.x, h: p.y - s.y } : s));
            return;
        }
        const t = tracoAtual.current; if (!t) return;
        t.pontos.push(p);
        setTracos((prev) => [...prev.slice(0, -1), { ...t, pontos: [...t.pontos] }]);
    }

    function onUp() { arrastando.current = false; tracoAtual.current = null; }

    function aplicarCorte() {
        if (!sel) { setModoCorte(false); return; }
        // Normaliza arrasto para cima/esquerda e recorta contra a área visível.
        const cv = baseRef.current!;
        const x = Math.max(0, Math.min(sel.x, sel.x + sel.w));
        const y = Math.max(0, Math.min(sel.y, sel.y + sel.h));
        const w = Math.min(Math.abs(sel.w), cv.width - x);
        const h = Math.min(Math.abs(sel.h), cv.height - y);
        if (w < 8 || h < 8) { setSel(null); setModoCorte(false); return; }
        const base = corte ?? { x: 0, y: 0, w: cv.width, h: cv.height };
        setCorte({ x: base.x + x, y: base.y + y, w, h });
        setTracos([]); // os traços eram do enquadramento antigo
        setSel(null);
        setModoCorte(false);
    }

    function girar(sentido: -1 | 1) {
        setRotacao((r) => (((r + sentido * 90 + 360) % 360) as EditState["rotacao"]));
        setCorte(null);   // o corte era do enquadramento anterior
        setTracos([]);
    }

    async function salvar() {
        const estado: EditState = { rotacao, corte, tracos };
        if (!houveEdicao(estado)) {
            // Caminho barato: abriu, olhou, salvou. Não rasteriza — foto de
            // cliente é JPEG e perde qualidade em qualquer re-encode.
            onSalvar({ file, legenda, estado });
            return;
        }
        try {
            const out = document.createElement("canvas");
            out.width = baseRef.current!.width;
            out.height = baseRef.current!.height;
            const c = out.getContext("2d")!;
            c.drawImage(baseRef.current!, 0, 0);
            c.drawImage(drawRef.current!, 0, 0);
            const ehPng = file.type === "image/png";
            const tipo = ehPng ? "image/png" : "image/jpeg";
            const blob = await new Promise<Blob | null>((res) =>
                out.toBlob(res, tipo, ehPng ? PNG_Q : JPEG_Q));
            if (!blob) throw new Error("toBlob devolveu null");
            const nome = file.name.replace(/(\.[^.]+)?$/, ehPng ? ".png" : ".jpg");
            onSalvar({ file: new File([blob], nome, { type: tipo }), legenda, estado });
        } catch (e) {
            // Não fecha o editor: fechar perdendo a edição é o anti-padrão nº1.
            setErro(`Não deu para salvar a imagem: ${String(e).slice(0, 120)}`);
        }
    }

    const btn = "h-10 min-w-10 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg "
        + "text-xs font-medium border transition-colors disabled:opacity-40";
    const btnOff = `${btn} border-[#C7D2FE] dark:border-[#3d4a60] text-[#37352F] dark:text-[#cbd5e1] `
        + "hover:bg-[#E0E7FF] dark:hover:bg-[#1e2536]";
    const btnOn = `${btn} border-[#6366F1] bg-[#6366F1] text-white`;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#191918]/80 backdrop-blur-sm"
            role="dialog" aria-modal="true" aria-label="Editar imagem">
            <div className="flex-1 min-h-0 flex flex-col m-auto w-full max-w-4xl
                            bg-[#F7F7F5] dark:bg-[#0f1829] md:rounded-2xl overflow-hidden
                            border border-[#C7D2FE] dark:border-[#3d4a60]">

                {/* barra de ferramentas — quebra em duas linhas em vez de rolar */}
                <div className="flex flex-wrap items-center gap-1.5 p-2 border-b
                                border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/80">
                    <button type="button" onClick={() => girar(-1)} className={btnOff} title="Girar à esquerda">
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => girar(1)} className={btnOff} title="Girar à direita">
                        <RotateCw className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => { setModoCorte((v) => !v); setSel(null); }}
                        className={modoCorte ? btnOn : btnOff} aria-pressed={modoCorte} title="Cortar">
                        <Crop className="w-4 h-4" />
                    </button>
                    {modoCorte && (
                        <button type="button" onClick={aplicarCorte} className={btnOn} title="Aplicar corte">
                            <Check className="w-4 h-4" /> Aplicar
                        </button>
                    )}

                    <span className="w-px h-6 bg-[#C7D2FE] dark:bg-[#3d4a60] mx-0.5" />

                    <button type="button" onClick={() => setBorracha(false)}
                        className={!borracha && !modoCorte ? btnOn : btnOff}
                        aria-pressed={!borracha} title="Desenhar">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setBorracha(true)}
                        className={borracha ? btnOn : btnOff} aria-pressed={borracha} title="Borracha">
                        <Eraser className="w-4 h-4" />
                    </button>

                    {ESPESSURAS.map((v) => (
                        <button key={v} type="button" onClick={() => setEspessura(v)}
                            className={espessura === v ? btnOn : btnOff}
                            aria-pressed={espessura === v} title={`Espessura ${v}`}>
                            <span className="rounded-full bg-current block"
                                style={{ width: v + 2, height: v + 2 }} />
                        </button>
                    ))}

                    {CORES.map((c) => (
                        <button key={c} type="button" onClick={() => { setCor(c); setBorracha(false); }}
                            className={`h-10 w-10 inline-flex items-center justify-center rounded-lg border
                                ${cor === c ? "border-[#6366F1] border-2" : "border-[#C7D2FE] dark:border-[#3d4a60]"}`}
                            aria-pressed={cor === c} title={`Cor ${c}`}>
                            <span className="w-5 h-5 rounded-full border border-[#191918]/20"
                                style={{ background: c }} />
                        </button>
                    ))}

                    <span className="w-px h-6 bg-[#C7D2FE] dark:bg-[#3d4a60] mx-0.5" />

                    <button type="button" onClick={() => setTracos((t) => t.slice(0, -1))}
                        disabled={tracos.length === 0} className={btnOff} title="Desfazer">
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setTracos([])}
                        disabled={tracos.length === 0} className={btnOff} title="Limpar traços">
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <button type="button" onClick={onCancelar}
                        className={`${btnOff} ml-auto`} title="Cancelar">
                        <X className="w-4 h-4" /> Cancelar
                    </button>
                </div>

                {/* área da imagem */}
                <div className="flex-1 min-h-0 overflow-auto p-3 flex items-center justify-center">
                    {erro ? (
                        <p className="text-sm text-rose-400 text-center px-4">{erro}</p>
                    ) : (
                        <div ref={wrapRef} className="relative touch-none select-none max-w-full">
                            <canvas ref={baseRef} className="block max-w-full h-auto rounded-lg" />
                            <canvas ref={drawRef}
                                className="absolute inset-0 block max-w-full h-auto rounded-lg cursor-crosshair"
                                onPointerDown={onDown} onPointerMove={onMove}
                                onPointerUp={onUp} onPointerCancel={onUp} />
                            {modoCorte && sel && (
                                <div className="absolute border-2 border-[#6366F1] bg-[#6366F1]/20 pointer-events-none"
                                    style={{
                                        left: `${(Math.min(sel.x, sel.x + sel.w) / (drawRef.current?.width || 1)) * 100}%`,
                                        top: `${(Math.min(sel.y, sel.y + sel.h) / (drawRef.current?.height || 1)) * 100}%`,
                                        width: `${(Math.abs(sel.w) / (drawRef.current?.width || 1)) * 100}%`,
                                        height: `${(Math.abs(sel.h) / (drawRef.current?.height || 1)) * 100}%`,
                                    }} />
                            )}
                        </div>
                    )}
                </div>

                {/* legenda + salvar */}
                <div className="flex items-end gap-1 p-2 border-t
                                border-[#C7D2FE] dark:border-[#3d4a60] bg-[#EEF2FF] dark:bg-[#1e2536]/80">
                    <EmojiPickerInput onEmojiSelect={(e) => setLegenda((l) => l + e)} />
                    <textarea
                        value={legenda}
                        onChange={(e) => setLegenda(e.target.value)}
                        rows={1}
                        placeholder="Adicionar legenda..."
                        className="flex-1 min-w-0 resize-none bg-transparent text-sm py-2.5
                                   text-[#37352F] dark:text-[#cbd5e1]
                                   placeholder:text-[#9B9A97] focus:outline-none" />
                    <button type="button" onClick={salvar} disabled={!pronto || !!erro}
                        className="h-10 px-4 rounded-lg bg-[#6366F1] text-white text-sm font-medium
                                   hover:bg-[#4F46E5] disabled:opacity-40 transition-colors shrink-0">
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
