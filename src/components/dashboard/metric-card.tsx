"use client";

import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";
import Link from "next/link";

interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: LucideIcon;
    trend?: {
        value: number;
        label: string;
    };
    gradient: string;
    iconColor: string;
    delay?: number;
    href?: string;
}

export function MetricCard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    gradient,
    iconColor,
    delay = 0,
    href,
}: MetricCardProps) {
    const content = (
        <div
            className={cn(
                "bento-card p-6 relative overflow-hidden bento-enter",
                gradient,
                href && "cursor-pointer hover:ring-2 hover:ring-brand-400/40"
            )}
            style={{ animationDelay: `${delay}ms` }}
        >
            {/* Decorative circle */}
            <div
                className={cn(
                    "absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-[0.12]",
                    iconColor.replace("text-", "bg-")
                )}
            />

            <div className="relative z-10 flex flex-col gap-3">
                {/* Icon + Title */}
                <div className="flex items-center justify-between">
                    <div
                        className={cn(
                            "flex items-center justify-center w-10 h-10 rounded-xl",
                            "bg-slate-900/50 backdrop-blur-sm shadow-sm"
                        )}
                    >
                        <Icon className={cn("w-5 h-5", iconColor)} />
                    </div>
                    {trend && (
                        <span
                            className={cn(
                                "text-xs font-semibold px-2.5 py-1 rounded-full",
                                trend.value >= 0
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/20 text-red-400"
                            )}
                        >
                            {trend.value >= 0 ? "+" : ""}
                            {trend.value}% {trend.label}
                        </span>
                    )}
                </div>

                {/* Value */}
                <div>
                    <p className="font-display text-3xl font-bold text-white tracking-tight">
                        {value}
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">{title}</p>
                    {subtitle && (
                        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
                    )}
                </div>
            </div>
        </div>
    );

    if (href) {
        return <Link href={href}>{content}</Link>;
    }

    return content;
}
