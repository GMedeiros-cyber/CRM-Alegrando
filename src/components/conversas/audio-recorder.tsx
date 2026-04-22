"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  disabled?: boolean;
  onRecorded: (file: File, previewUrl: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onError?: (message: string) => void;
}

type Mode = "idle" | "recording";

function pickMimeType(): { mime: string; ext: string } {
  // Prefere OGG Opus (formato nativo do WhatsApp para PTT). Cai para WebM em
  // browsers que não suportam OGG no MediaRecorder (ex.: Chrome desktop).
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
  ];
  if (typeof window === "undefined" || !("MediaRecorder" in window)) {
    return { mime: "", ext: "ogg" };
  }
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "ogg" };
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioRecorder({ disabled, onRecorded, onRecordingChange, onError }: AudioRecorderProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onRecordingChange?.(mode === "recording");
  }, [mode, onRecordingChange]);

  const cleanupStream = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const startRecording = useCallback(async () => {
    if (disabled || mode !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Gravação de áudio não suportada neste navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime, ext } = pickMimeType();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const wasCancelled = cancelledRef.current;
        const collected = chunksRef.current.slice();
        const recorderMime = recorder.mimeType || mime || "audio/webm";
        cleanupStream();
        setMode("idle");
        setElapsed(0);
        if (wasCancelled || collected.length === 0) return;

        const blob = new Blob(collected, { type: recorderMime });
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type: recorderMime });
        const previewUrl = URL.createObjectURL(blob);
        onRecorded(file, previewUrl);
      };

      recorder.onerror = () => {
        onError?.("Erro durante a gravação.");
        cancelledRef.current = true;
        try { recorder.stop(); } catch { /* ignore */ }
      };

      startedAtRef.current = Date.now();
      setElapsed(0);
      setMode("recording");
      recorder.start();

      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 200);
    } catch (err) {
      const msg = err instanceof Error && err.name === "NotAllowedError"
        ? "Permissão de microfone negada."
        : "Não foi possível iniciar a gravação.";
      onError?.(msg);
      cleanupStream();
      setMode("idle");
    }
  }, [disabled, mode, onRecorded, onError, cleanupStream]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    cancelledRef.current = false;
    try { recorder.stop(); } catch { /* ignore */ }
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    cancelledRef.current = true;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* ignore */ }
    } else {
      cleanupStream();
      setMode("idle");
      setElapsed(0);
    }
  }, [cleanupStream]);

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
