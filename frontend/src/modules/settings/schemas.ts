import { z } from "zod";

/** Same rule as the API (LabelName): trimmed, 1 to 40 characters. The server also checks case insensitive uniqueness. */
/** Same rules as the API (OrgName, OrgUpdateIn.ai_daily_limit, Name). The server checks again. */
export const orgNameSchema = z.string().trim().min(2, "Use at least 2 characters.").max(80, "Use at most 80 characters.");

export const dailyLimitSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number.")
  .refine((v) => Number(v) >= 1 && Number(v) <= 100_000, "Use a number from 1 to 100000.");

export const fullNameSchema = z.string().trim().min(1, "Enter your name.").max(120, "Use at most 120 characters.");

export const labelNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a label name.")
  .max(40, "Use 40 characters or fewer.");
