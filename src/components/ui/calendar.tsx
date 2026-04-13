"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// CSS padrão da v9 do react-day-picker para garantir a estrutura
import "react-day-picker/dist/style.css"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            locale={ptBR}
            showOutsideDays={showOutsideDays}
            className={cn("p-3 select-none", className)}
            classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 relative",
                month: "space-y-4",
                month_caption: "flex justify-center pt-1 relative items-center h-8",
                caption_label: "text-sm font-semibold text-[#191918] dark:text-white",
                nav: "flex items-center absolute w-full justify-between z-10 pointers-events-none",
                button_previous: "h-7 w-7 bg-[#EEF2FF] dark:bg-[#1e2536] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] hover:text-[#191918] dark:hover:text-white pointer-events-auto rounded-md border border-[#A5B4FC] dark:border-[#4a5568] inline-flex items-center justify-center transition-colors shadow-sm",
                button_next: "h-7 w-7 bg-[#EEF2FF] dark:bg-[#1e2536] text-[#37352F] dark:text-[#cbd5e1] hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] hover:text-[#191918] dark:hover:text-white pointer-events-auto rounded-md border border-[#A5B4FC] dark:border-[#4a5568] inline-flex items-center justify-center transition-colors shadow-sm",
                month_grid: "w-full border-collapse space-y-1 mx-auto",
                weekdays: "flex",
                weekday: "text-[#6366F1] dark:text-[#94a3b8] rounded-md w-9 font-normal text-[0.8rem]",
                week: "flex w-full mt-2",
                day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 text-[#37352F] dark:text-[#cbd5e1]",
                day_button: "h-9 w-9 p-0 font-normal rounded-md hover:bg-[#E0E7FF] dark:hover:bg-[#2d3347] hover:text-[#191918] dark:hover:text-white inline-flex items-center justify-center transition-colors mx-auto aria-selected:bg-brand-500 aria-selected:text-[#191918] dark:text-white aria-selected:hover:bg-brand-600 aria-selected:font-bold",
                range_end: "day-range-end",
                selected: "bg-brand-500 text-[#191918] dark:text-white font-bold rounded-md",
                today: "bg-[#E0E7FF] dark:bg-[#2d3347]/80 text-[#191918] dark:text-white font-bold rounded-md border border-[#A5B4FC] dark:border-[#4a5568]",
                outside: "text-[#9B9A97] dark:text-[#64748b] opacity-50 day-outside",
                disabled: "text-[#9B9A97] dark:text-[#64748b] opacity-50",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: (props) => {
                    if (props.orientation === "left") {
                        return <ChevronLeft className="h-4 w-4" />
                    }
                    return <ChevronRight className="h-4 w-4" />
                },
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
