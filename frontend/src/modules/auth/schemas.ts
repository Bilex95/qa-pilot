import { z } from "zod";

/* Client side checks that mirror the backend rules (D-020); the server validates again. */
export const emailSchema = z.string().trim().min(1, "Enter your email.").email("Enter a valid email address.");

export const passwordPolicy = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .regex(/[A-Za-z]/, "Add at least one letter.")
  .regex(/\d/, "Add at least one number.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(120, "Use at most 120 characters."),
  email: emailSchema,
  password: passwordPolicy,
});

export const orgSetupSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80, "Use at most 80 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/, "Use 2 to 40 lowercase letters, numbers and hyphens.")
    .refine((s) => !s.includes("--"), "Use single hyphens."),
});

export type FieldErrors = Partial<Record<string, string>>;

export function zodErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
