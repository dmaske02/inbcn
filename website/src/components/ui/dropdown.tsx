"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as DropdownPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Dropdown = DropdownPrimitive.Root;
const DropdownTrigger = DropdownPrimitive.Trigger;
const DropdownGroup = DropdownPrimitive.Group;
const DropdownPortal = DropdownPrimitive.Portal;
const DropdownSub = DropdownPrimitive.Sub;
const DropdownRadioGroup = DropdownPrimitive.RadioGroup;

function DropdownContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

function DropdownItem({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Item> & { inset?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "relative flex min-h-10 cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "ps-8",
        className,
      )}
      {...props}
    />
  );
}

function DropdownLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownPrimitive.Label
      className={cn("px-2 py-1.5 text-xs font-semibold", inset && "ps-8", className)}
      {...props}
    />
  );
}

function DropdownSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Separator>) {
  return (
    <DropdownPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ComponentProps<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "relative flex min-h-10 cursor-default items-center rounded-sm py-2 pe-2 ps-8 text-sm outline-none select-none focus:bg-accent",
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  );
}

function DropdownSubTrigger({
  className,
  inset,
  children,
  ...props
}: ComponentProps<typeof DropdownPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownPrimitive.SubTrigger
      className={cn(
        "flex min-h-10 cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent",
        inset && "ps-8",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ms-auto size-4 rtl:rotate-180" />
    </DropdownPrimitive.SubTrigger>
  );
}

function DropdownSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.SubContent>) {
  return (
    <DropdownPrimitive.SubContent
      className={cn(
        "z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dropdown,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownGroup,
  DropdownItem,
  DropdownLabel,
  DropdownPortal,
  DropdownRadioGroup,
  DropdownSeparator,
  DropdownSub,
  DropdownSubContent,
  DropdownSubTrigger,
  DropdownTrigger,
};
