import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse screenshotUrl field: handles legacy single URL, JSON array, or null */
export function parseScreenshots(screenshotUrl: string | null): string[] {
  if (!screenshotUrl) return [];
  if (screenshotUrl.startsWith("[")) {
    try {
      const parsed = JSON.parse(screenshotUrl);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [screenshotUrl];
}

/** Serialize screenshot array to store in DB */
export function serializeScreenshots(urls: string[]): string | null {
  if (urls.length === 0) return null;
  return JSON.stringify(urls);
}

/** Linear label IDs are UUIDs — reject obviously invalid values like column names */
export function isValidLinearLabelId(id: string | null): id is string {
  return !!id && /^[0-9a-f-]{8,}$/i.test(id);
}
