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
                        "justify-start text-left font-normal h-8 text-sm bg-[#EEF2FF] dark:bg-[#1e2536] border-[#A5B4FC] dark:border-[#4a5568] text-[#191918] dark:text-white hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] hover:text-[#191918] dark:hover:text-white",
                        !value && "text-[#6366F1] dark:text-[#94a3b8]",
                        className
                    )}
                >
                    <CalendarDays className="mr-2 h-3.5 w-3.5 text-[#6366F1] dark:text-[#94a3b8]" />
                    {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 bg-[#EEF2FF] dark:bg-[#1e2536] border-[#C7D2FE] dark:border-[#3d4a60]" align="start">
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
