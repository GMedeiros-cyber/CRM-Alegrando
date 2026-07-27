"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type OpusRecorder from "opus-recorder";

interface AudioRecorderProps {
  disabled?: boolean;
  onRecorded: (file: File, previewUrl: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onError?: (message: string) => void;
}

type Mode = "idle" | "recording";

// Worker WASM do opus-recorder, servido de /public (copiado de
// node_modules/opus-recorder/dist/). Gera OGG/Opus NATIVO no browser — o
// MediaRecorder do Chrome só faz WebM/Opus, e a Z-API não transcodifica WebM,
// resultando em voice note 00:00. Com OGG real o WhatsApp renderiza a duração e
// o waveform corretamente.
const ENCODER_PATH = "/opus/encoderWorker.min.js";

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioRecorder({ disabled, onRecorded, onRecordingChange, onError }: AudioRecorderProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<OpusRecorder | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onRecordingChange?.(mode === "recording");
  }, [mode, onRecordingChange]);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const rec = recorderRef.current;
    if (rec) {
      try { rec.close(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startRecording = useCallback(async () => {
    if (disabled || mode !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Gravação de áudio não suportada neste navegador.");
      return;
    }

    try {
      // Import dinâmico: opus-recorder é client-only e carrega o worker WASM.
      const { default: Recorder } = await import("opus-recorder");

      const rec = new Recorder({
        encoderPath: ENCODER_PATH,
        numberOfChannels: 1,
        encoderApplication: 2048, // VOIP — otimizado pra voz
        encoderSampleRate: 48000,
        streamPages: false, // recebe o arquivo OGG completo no fim
      });
      recorderRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;

      rec.ondataavailable = (typedArray: Uint8Array) => {
        if (typedArray && typedArray.length > 0) {
          // Cópia: o buffer do worker pode ser reaproveitado após o callback.
          chunksRef.current.push(new Uint8Array(typedArray));
        }
      };

      rec.onstop = () => {
        const wasCancelled = cancelledRef.current;
        const collected = chunksRef.current.slice();
        const durationMs = Date.now() - startedAtRef.current;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        recorderRef.current = null;
        chunksRef.current = [];
        setMode("idle");
        setElapsed(0);
        // Descarta cancelamentos e gravações vazias/curtíssimas.
        if (wasCancelled || collected.length === 0 || durationMs < 300) return;

        const blob = new Blob(collected as BlobPart[], { type: "audio/ogg" });
        const file = new File([blob], `gravacao-${Date.now()}.ogg`, { type: "audio/ogg" });
        const previewUrl = URL.createObjectURL(blob);
        onRecorded(file, previewUrl);
      };

      await rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setMode("recording");
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 200);
    } catch (err) {
      const msg = err instanceof Error && (err.name === "NotAllowedError" || err.name === "SecurityError")
        ? "Permissão de microfone negada."
        : "Não foi possível iniciar a gravação.";
      onError?.(msg);
      cleanup();
      setMode("idle");
    }
  }, [disabled, mode, onRecorded, onError, cleanup]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    cancelledRef.current = false;
    // stop() finaliza o OGG → dispara ondataavailable (arquivo completo) → onstop.
    rec.stop().catch(() => {
      cleanup();
      setMode("idle");
      setElapsed(0);
    });
  }, [cleanup]);

  const cancelRecording = useCallback(() => {
    const rec = recorderRef.current;
    cancelledRef.current = true;
    if (rec) {
      rec.stop().catch(() => {
        cleanup();
        setMode("idle");
        setElapsed(0);
      });
    } else {
      cleanup();
      setMode("idle");
      setElapsed(0);
    }
  }, [cleanup]);

  if (mode === "recording") {
    return (
      <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-xl bg-[#EEF2FF] dark:bg-[#1e2536] border border-[#A5B4FC] dark:border-[#4a5568]">
        <button
          type="button"
          onClick={cancelRecording}
          className="flex items-center justify-center w-8 h-8 rounded-full text-[#6366F1] dark:text-[#94a3b8] hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title="Cancelar gravação"
          aria-label="Cancelar gravação"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-xs font-medium text-[#191918] dark:text-white/80 tabular-nums">
            Gravando {formatElapsed(elapsed)}
          </span>
        </div>
        <button
          type="button"
          onClick={stopRecording}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-400 hover:bg-brand-500 text-white transition-colors shrink-0"
          title="Finalizar gravação"
          aria-label="Finalizar gravação"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center w-10 h-10 rounded-xl transition-colors shrink-0 border",
        "hover:bg-[#EEF2FF] dark:hover:bg-[#1e2536] border-[#C7D2FE] dark:border-[#3d4a60]/50",
        "text-[#6366F1] dark:text-[#94a3b8] hover:text-[#191918] dark:hover:text-white",
        "disabled:opacity-30 disabled:cursor-not-allowed"
      )}
      title="Gravar áudio"
      aria-label="Gravar áudio"
    >
      <Mic className="w-4 h-4" />
    </button>
  );
}
