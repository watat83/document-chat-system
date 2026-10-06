"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

export interface DatePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  fromDate?: Date
  toDate?: Date
  disabledDays?: Date[]
  className?: string
  error?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  fromDate,
  toDate,
  disabledDays = [],
  className,
  error = false,
}: DatePickerProps) {
  // Use local state for individual dropdown values
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    value ? (value.getMonth() + 1).toString() : ""
  )
  const [selectedDay, setSelectedDay] = React.useState<string>(
    value ? value.getDate().toString() : ""
  )
  const [selectedYear, setSelectedYear] = React.useState<string>(
    value ? value.getFullYear().toString() : ""
  )

  // Update local state when value prop changes
  const valueTimestamp = value?.getTime()
  const [previousTimestamp, setPreviousTimestamp] = React.useState(valueTimestamp)
  if (previousTimestamp !== valueTimestamp) {
    setPreviousTimestamp(valueTimestamp)
    if (value) {
      setSelectedMonth((value.getMonth() + 1).toString())
      setSelectedDay(value.getDate().toString())
      setSelectedYear(value.getFullYear().toString())
    } else {
      setSelectedMonth("")
      setSelectedDay("")
      setSelectedYear("")
    }
  }

  // Generate options
  const months = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ]

  const generateDays = (month?: string, year?: string) => {
    if (!month || !year) return Array.from({ length: 31 }, (_, i) => i + 1)
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => i + 1)
  }

  const generateYears = () => {
    const currentYear = new Date().getFullYear()
    const startYear = fromDate ? fromDate.getFullYear() : currentYear - 100
    const endYear = toDate ? toDate.getFullYear() : currentYear + 10
    const years = []
    for (let year = endYear; year >= startYear; year--) {
      years.push(year)
    }
    return years
  }

  const days = generateDays(selectedMonth, selectedYear)
  const years = generateYears()

  // Helper to create a date and call onChange if valid
  const createAndSetDate = (month: string, day: string, year: string) => {
    if (month && day && year) {
      const m = parseInt(month)
      const d = parseInt(day)
      const y = parseInt(year)
      
      // Validate the date
      const newDate = new Date(y, m - 1, d)
      // Check if the date is valid (handles invalid dates like Feb 30)
      if (
        newDate.getFullYear() === y &&
        newDate.getMonth() === m - 1 &&
        newDate.getDate() === d
      ) {
        onChange?.(newDate)
      }
    }
  }

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
    // If day is invalid for new month, reset it
    const newDays = generateDays(month, selectedYear)
    let newDay = selectedDay
    if (selectedDay && parseInt(selectedDay) > newDays.length) {
      newDay = ""
      setSelectedDay("")
    }
    // Try to create date with new month
    createAndSetDate(month, newDay, selectedYear)
  }

  const handleDayChange = (day: string) => {
    setSelectedDay(day)
    // Create date with new day
    createAndSetDate(selectedMonth, day, selectedYear)
  }

  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    // If day is invalid for new year (leap year changes), reset it
    const newDays = generateDays(selectedMonth, year)
    let newDay = selectedDay
    if (selectedDay && parseInt(selectedDay) > newDays.length) {
      newDay = ""
      setSelectedDay("")
    }
    // Try to create date with new year
    createAndSetDate(selectedMonth, newDay, year)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-3 gap-2">
        {/* Month Select */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Month</Label>
          <Select
            value={selectedMonth}
            onValueChange={handleMonthChange}
            disabled={disabled}
          >
            <SelectTrigger
              className={cn(
                "h-9",
                error && "border-red-500 focus:ring-red-500",
                !selectedMonth && "text-muted-foreground"
              )}
            >
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Day Select */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Day</Label>
          <Select
            value={selectedDay}
            onValueChange={handleDayChange}
            disabled={disabled}
          >
            <SelectTrigger
              className={cn(
                "h-9",
                error && "border-red-500 focus:ring-red-500",
                !selectedDay && "text-muted-foreground"
              )}
            >
              <SelectValue placeholder="Day" />
            </SelectTrigger>
            <SelectContent>
              {days.map((day) => (
                <SelectItem key={day} value={day.toString()}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year Select */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Year</Label>
          <Select
            value={selectedYear}
            onValueChange={handleYearChange}
            disabled={disabled}
          >
            <SelectTrigger
              className={cn(
                "h-9",
                error && "border-red-500 focus:ring-red-500",
                !selectedYear && "text-muted-foreground"
              )}
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Selected Date Display */}
      {value && (
        <div className="text-sm text-muted-foreground">
          Selected: {format(value, "MMMM d, yyyy")}
        </div>
      )}
    </div>
  )
}

// Preset date picker configurations for common use cases
export const DatePickerPresets = {
  // For past dates only (e.g., business established date)
  pastOnly: (): Partial<DatePickerProps> => ({
    toDate: new Date(),
    placeholder: "Select past date",
  }),

  // For future dates only (e.g., expiration dates)
  futureOnly: (): Partial<DatePickerProps> => ({
    fromDate: new Date(),
    placeholder: "Select future date",
  }),

  // For birth dates (18+ years ago)
  birthDate: (): Partial<DatePickerProps> => {
    const today = new Date()
    const eighteenYearsAgo = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate()
    )
    return {
      toDate: eighteenYearsAgo,
      placeholder: "Select birth date",
    }
  },

  // For business established dates (reasonable range)
  businessEstablished: (): Partial<DatePickerProps> => {
    const today = new Date()
    const oldestBusiness = new Date(1800, 0, 1) // Reasonable minimum
    return {
      fromDate: oldestBusiness,
      toDate: today,
      placeholder: "When was your business established?",
    }
  },

  // For contract/certification expiration dates
  expirationDate: (): Partial<DatePickerProps> => {
    const today = new Date()
    const maxFuture = new Date(
      today.getFullYear() + 30,
      today.getMonth(),
      today.getDate()
    )
    return {
      fromDate: today,
      toDate: maxFuture,
      placeholder: "Select expiration date",
    }
  },

  // For project completion dates (past with reasonable range)
  projectCompletion: (): Partial<DatePickerProps> => {
    const today = new Date()
    const oldestProject = new Date(1990, 0, 1)
    return {
      fromDate: oldestProject,
      toDate: today,
      placeholder: "Project completion date",
    }
  },
}

// Year-only picker component for business established dates
export interface YearPickerProps {
  value?: number
  onChange?: (year: number | undefined) => void
  placeholder?: string
  disabled?: boolean
  fromYear?: number
  toYear?: number
  className?: string
  error?: boolean
}

export function YearPicker({
  value,
  onChange,
  placeholder = "Select year",
  disabled = false,
  fromYear = 1800,
  toYear = new Date().getFullYear(),
  className,
  error = false,
}: YearPickerProps) {
  const generateYearOptions = () => {
    const years = []
    for (let year = toYear; year >= fromYear; year--) {
      years.push(year)
    }
    return years
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Select
        value={value?.toString() || ""}
        onValueChange={(yearStr) => {
          const year = parseInt(yearStr)
          onChange?.(isNaN(year) ? undefined : year)
        }}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            "w-full h-9",
            error && "border-red-500 focus:ring-red-500",
            !value && "text-muted-foreground"
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {generateYearOptions().map((year) => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Selected Year Display */}
      {value && (
        <div className="text-sm text-muted-foreground">
          Selected: {value}
        </div>
      )}
    </div>
  )
}