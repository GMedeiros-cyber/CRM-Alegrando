"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

interface TimePickerProps {
    value: string          // "HH:MM"
    onChange: (value: string) => void
    className?: string
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [selectedHour, setSelectedHour] = React.useState(() => {
        const [h] = (value || "09:00").split(":")
        return parseInt(h)
    })
    const [selectedMin, setSelectedMin] = React.useState(() => {
        const [, m] = (value || "09:00").split(":")
        return parseInt(m)
    })

    const hours = Array.from({ length: 24 }, (_, i) => i)
    const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

    const hourRef = React.useRef<HTMLDivElement>(null)
    const minRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        if (open) {
            setTimeout(() => {
                hourRef.current?.querySelector(`[data-hour="${selectedHour}"]`)?.scrollIntoView({ block: "center" })
                minRef.current?.querySelector(`[data-min="${selectedMin}"]`)?.scrollIntoView({ block: "center" })
            }, 50)
        }
    }, [open, selectedHour, selectedMin])

    function handleConfirm() {
        const h = String(selectedHour).padStart(2, "0")
        const m = String(selectedMin).padStart(2, "0")
        onChange(`${h}:${m}`)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "justify-start text-left font-normal h-8 text-sm bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white",
                        className
                    )}
                >
                    <Clock className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {value || "09:00"}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0 bg-slate-800 border-slate-700" align="start">
                <div className="flex h-[200px]">
                    {/* Hours */}
                    <div ref={hourRef} className="flex-1 overflow-y-auto border-r border-slate-700 py-1">
                        {hours.map(h => (
                            <button
                                key={h}
                                data-hour={h}
                                onClick={() => setSelectedHour(h)}
                                className={cn(
                                    "w-full px-3 py-1.5 text-sm text-center transition-colors",
                                    selectedHour === h
                                        ? "bg-brand-500 text-white font-semibold"
                                        : "text-slate-300 hover:bg-slate-700"
                                )}
                            >
                                {String(h).padStart(2, "0")}
                            </button>
                        ))}
                    </div>
                    {/* Minutes */}
                    <div ref={minRef} className="flex-1 overflow-y-auto py-1">
                        {minutes.map(m => (
                            <button
                                key={m}
                                data-min={m}
                                onClick={() => setSelectedMin(m)}
                                className={cn(
                                    "w-full px-3 py-1.5 text-sm text-center transition-colors",
                                    selectedMin === m
                                        ? "bg-brand-500 text-white font-semibold"
                                        : "text-slate-300 hover:bg-slate-700"
                                )}
                            >
                                {String(m).padStart(2, "0")}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    onClick={handleConfirm}
                    className="w-full py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors"
                >
                    Confirmar
                </button>
            </PopoverContent>
        </Popover>
    )
}
