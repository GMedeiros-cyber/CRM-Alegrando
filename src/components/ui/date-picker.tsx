"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerProps {
    value: string          // "YYYY-MM-DD" or ""
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
    minDate?: Date
}

export function DatePicker({
    value,
    onChange,
    placeholder = "Selecionar data",
    className,
    disabled,
    minDate,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined

    function handleSelect(day: Date | undefined) {
        if (day) {
            onChange(format(day, "yyyy-MM-dd"))
        } else {
            onChange("")
        }
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "justify-start text-left font-normal h-8 text-sm bg-slate-800 border-slate-600 text-white hover:bg-slate-700 hover:text-white",
                        !value && "text-slate-500",
                        className
                    )}
                >
                    <CalendarDays className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 bg-slate-800 border-slate-700" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    disabled={minDate ? (d) => d < minDate : undefined}
                />
            </PopoverContent>
        </Popover>
    )
}
