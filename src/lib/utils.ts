import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidPhotoUrl(url: string | null | undefined): url is string {
  return !!url && url !== "null" && url !== "undefined" && url.startsWith("http")
}
