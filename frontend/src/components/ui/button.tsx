import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/* shadcn/ui pattern rendering the locked design's .btn classes (D-043). */
const buttonVariants = cva("btn", {
  variants: {
    variant: { default: "", primary: "primary", ghost: "ghost", danger: "danger" },
    size: { default: "", sm: "sm", icon: "icon-btn" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : (type ?? "button")} {...props} />;
}

/** The red fill of the confirm button in a delete dialog (the locked design has no filled danger button class). */
export const DANGER_FILL = { background: "var(--danger)", borderColor: "var(--danger)" } as const;

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
