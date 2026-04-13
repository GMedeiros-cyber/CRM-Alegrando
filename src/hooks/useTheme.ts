"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase/client";

export type Theme = "light" | "dark";

export function useTheme() {
    const { user, isLoaded } = useUser();
    const [theme, setTheme] = useState<Theme>("light");
    const [isMounted, setIsMounted] = useState(false);

    const applyTheme = useCallback((t: Theme) => {
        if (t === "dark") {
            document.documentElement.setAttribute("data-theme", "dark");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }
    }, []);

    useEffect(() => {
        setIsMounted(true);
        if (!isLoaded) return;

        async function loadTheme() {
            if (user?.id) {
                const { data } = await supabase
                    .from("users")
                    .select("theme")
                    .eq("clerk_id", user.id)
                    .single();

                if (data?.theme) {
                    const t = data.theme as Theme;
                    setTheme(t);
                    applyTheme(t);
                    localStorage.setItem("crm-theme", t);
                    return;
                }
            }

            const saved = localStorage.getItem("crm-theme") as Theme | null;
            const t = saved || "light";
            setTheme(t);
            applyTheme(t);
        }

        loadTheme();
    }, [isLoaded, user, applyTheme]);

    const toggleTheme = useCallback(async () => {
        const next: Theme = theme === "light" ? "dark" : "light";

        setTheme(next);
        applyTheme(next);
        localStorage.setItem("crm-theme", next);

        if (user?.id) {
            await supabase
                .from("users")
                .update({ theme: next, updated_at: new Date().toISOString() })
                .eq("clerk_id", user.id);
        }
    }, [theme, user, applyTheme]);

    return { theme, toggleTheme, isMounted };
}
