"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import {
    LayoutDashboard,
    Kanban,
    MessageSquare,
    CalendarDays,
    ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Kanban", href: "/kanban", icon: Kanban },
    { name: "Conversas", href: "/conversas", icon: MessageSquare },
    { name: "Agenda", href: "/agenda", icon: CalendarDays },
    { name: "Tarefas", href: "/tarefas", icon: ClipboardCheck },
];

export function Sidebar() {
    const pathname = usePathname();
    const [expanded, setExpanded] = useState(false);

    return (
        <aside
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            className={cn(
                "fixed left-0 top-0 z-40 flex h-screen flex-col items-center bg-[#FFA832] border-r-2 border-orange-400 py-4 transition-all duration-300",
                expanded ? "w-[176px]" : "w-[64px]"
            )}
        >
            {/* Brand — Logo */}
            <div className="flex h-14 w-full items-center justify-center px-3 mb-6">
                <Image
                    src="/logo.png"
                    alt="Alegrando"
                    width={48}
                    height={48}
                    className="shrink-0"
                    unoptimized
                />
            </div>

            {/* Navigation */}
            <nav className="flex flex-1 flex-col items-center gap-1 w-full px-2">
                {navigation.map((item) => {
                    const isActive =
                        pathname === item.href || pathname.startsWith(item.href + "/");

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 overflow-hidden",
                                isActive
                                    ? "bg-white/30 text-slate-900 shadow-sm backdrop-blur-sm"
                                    : "text-slate-800 hover:bg-white/20 hover:text-slate-900"
                            )}
                        >
                            <item.icon
                                className={cn(
                                    "h-5 w-5 shrink-0 transition-colors duration-200",
                                    isActive
                                        ? "text-slate-900"
                                        : "text-slate-700 group-hover:text-slate-900"
                                )}
                            />
                            <span
                                className={cn(
                                    "whitespace-nowrap transition-all duration-300 overflow-hidden",
                                    expanded ? "w-auto opacity-100" : "w-0 opacity-0"
                                )}
                            >
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {/* User section — foto maior */}
            <div className="w-full px-2 pt-4 border-t border-white/20">
                <div className="flex items-center justify-center gap-3 px-3 py-2">
                    <UserButton
                        afterSignOutUrl="/sign-in"
                        appearance={{
                            elements: {
                                avatarBox: "h-11 w-11 rounded-xl",
                            },
                        }}
                    />
                    <span
                        className={cn(
                            "text-xs text-slate-800 font-semibold truncate whitespace-nowrap transition-all duration-300 overflow-hidden",
                            expanded ? "w-auto opacity-100" : "w-0 opacity-0"
                        )}
                    >
                        Alegrando CRM
                    </span>
                </div>
            </div>
        </aside>
    );
}
