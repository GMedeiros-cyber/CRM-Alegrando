"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  variant?: "sent" | "received";
  className?: string;
}

const SPEED_CYCLE = [1, 1.5, 2] as const;
type Speed = (typeof SPEED_CYCLE)[number];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, variant = "received", className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [isSeeking, setIsSeeking] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration)) setDuration(audio.duration);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isSeeking) return;
    setCurrentTime(audio.currentTime);
  }, [isSeeking]);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_CYCLE.indexOf(prev);
      return SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    });
  }, []);

  const seekFromEvent = useCallback((clientX: number) => {
    const bar = barRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !isFinite(audio.duration)) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const newTime = ratio * audio.duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const onBarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSeeking(true);
    seekFromEvent(e.clientX);
  }, [seekFromEvent]);

  const onBarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeeking) return;
    seekFromEvent(e.clientX);
  }, [isSeeking, seekFromEvent]);

  const onBarPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsSeeking(false);
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remaining = duration > 0 ? Math.max(duration - currentTime, 0) : 0;
  const displayTime = isPlaying || currentTime > 0 ? currentTime : remaining;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-xl min-w-[220px] max-w-[280px]",
        variant === "sent"
          ? "bg-[#191918]/5 dark:bg-white/5"
          : "bg-[#E0E7FF] dark:bg-[#2d3347]/60",
        className
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <button
        type="button"
        onClick={togglePlay}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-400 hover:bg-brand-500 active:scale-95 text-white shrink-0 transition-colors"
        aria-label={isPlaying ? "Pausar" : "Reproduzir"}
      >
        {isPlaying
          ? <Pause className="w-4 h-4" fill="currentColor" />
          : <Play className="w-4 h-4 translate-x-[1px]" fill="currentColor" />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          ref={barRef}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          className="relative h-1.5 rounded-full cursor-pointer bg-[#191918]/15 dark:bg-white/15 touch-none"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand-400"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 w-3 h-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-brand-400 shadow-sm transition-opacity"
            style={{ left: `${progressPct}%`, opacity: duration > 0 ? 1 : 0 }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-[#191918]/60 dark:text-white/50 tabular-nums">
          <div className="flex items-center gap-1">
            <Mic className="w-3 h-3" />
            <span>{formatTime(displayTime)}</span>
          </div>
          <button
            type="button"
            onClick={cycleSpeed}
            className="px-1.5 py-0.5 rounded bg-[#191918]/10 dark:bg-white/10 hover:bg-[#191918]/15 dark:hover:bg-white/15 font-medium text-[#191918]/70 dark:text-white/70"
            aria-label="Velocidade de reprodução"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
