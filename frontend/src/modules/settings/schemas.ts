import { z } from "zod";

/** Same rule as the API (LabelName): trimmed, 1 to 40 characters. The server also checks case insensitive uniqueness. */
export const labelNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a label name.")
  .max(40, "Use 40 characters or fewer.");
