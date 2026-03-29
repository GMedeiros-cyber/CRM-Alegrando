"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

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
            className={cn("p-3", className)}
            classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                month_caption: "flex justify-between items-center pt-1 px-1 mb-1",
                caption_label: "text-sm font-medium text-slate-200",
                nav: "space-x-1 flex items-center",
                button_previous: "h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors bg-transparent p-0",
                button_next: "h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors bg-transparent p-0",
                month_grid: "w-full border-collapse space-y-1",
                weekdays: "flex",
                weekday: "text-slate-500 rounded-md w-9 font-normal text-[0.8rem]",
                week: "flex w-full mt-2",
                day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                day_button: "h-9 w-9 p-0 font-normal rounded-md hover:bg-slate-700 text-slate-300 inline-flex items-center justify-center transition-colors",
                range_end: "day-range-end",
                selected: "bg-brand-500 text-white hover:bg-brand-600 focus:bg-brand-600 rounded-md",
                today: "bg-slate-700 text-white font-bold rounded-md",
                outside: "text-slate-600 opacity-50",
                disabled: "text-slate-600 opacity-50",
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
