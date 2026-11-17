"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/* shadcn/ui style wrapper over Radix, styled with the locked design's .menu classes. Keyboard and focus handling come from Radix. */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

/** Anchored to the trigger edge given by `align`; Radix flips or shifts it to stay 8 px inside the viewport (D-044). */
export function DropdownMenuContent({ className, sideOffset = 4, align = "start", collisionPadding = 8, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} align={align} collisionPadding={collisionPadding} avoidCollisions
        className={cn("menu", className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn("menu-item", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("menu-label", className)} {...props} />;
}
