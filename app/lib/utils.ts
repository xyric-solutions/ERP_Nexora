import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names while allowing later Tailwind classes to win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
