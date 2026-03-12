import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Linear label IDs are UUIDs — reject obviously invalid values like column names */
export function isValidLinearLabelId(id: string | null): id is string {
  return !!id && /^[0-9a-f-]{8,}$/i.test(id);
}
