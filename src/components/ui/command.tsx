"use client";

import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { AdaptiveLiquidGlass } from "@/components/ui/adaptive-liquid-glass";

/**
 * Command palette primitives built on cmdk.
 * Entertainment search will plug into CommandInput + CommandList in later phases.
 */
const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-3xl bg-transparent text-popover-foreground",
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

type CommandDialogProps = DialogProps & {
  shouldFilter?: boolean;
  className?: string;
  wide?: boolean;
};

/** The app's actual scrollable region (see AppShell). Falls back to the document if absent. */
function getScrollContainer(): HTMLElement {
  return (document.getElementById("main-content") as HTMLElement | null) ?? document.documentElement;
}

/** Forwards wheel deltas from the dialog overlay to the page's real scroll container. */
function forwardScrollToPage(event: React.WheelEvent<HTMLDivElement>) {
  getScrollContainer().scrollBy({ top: event.deltaY, left: event.deltaX });
}

let lastTouchY: number | null = null;
/** Forwards single-finger touch scrolling from the dialog overlay to the page's real scroll container. */
function forwardTouchScrollToPage(event: React.TouchEvent<HTMLDivElement>) {
  const touch = event.touches[0];
  if (!touch) return;
  if (lastTouchY !== null) {
    getScrollContainer().scrollBy({ top: lastTouchY - touch.clientY });
  }
  lastTouchY = touch.clientY;
}

function CommandDialog({
  children,
  className,
  shouldFilter = false,
  wide = false,
  ...props
}: CommandDialogProps) {
  return (
    // Non-modal: Radix skips its body-scroll lock and pointer-blocking
    // wrapper entirely, so the page behind the panel keeps scrolling exactly
    // like it does when the search box is closed. Dismissal (overlay click,
    // Escape, outside pointerdown) still works via onOpenChange/onInteractOutside.
    <Dialog modal={false} {...props}>
      <DialogPortal>
        {/* Standard dismiss overlay: minimal transparent dimming, NO page blur, NO page modification.
            pointer-events left enabled so clicking it still dismisses the panel in non-modal mode.
            Wheel/touch input is forwarded to the page's real scroll container (#main-content)
            so scrolling while the dialog is open feels identical to scrolling with it closed —
            the overlay would otherwise absorb those events since it has no scrollable content itself. */}
        <DialogOverlay
          className="bg-black/25 backdrop-blur-none"
          onWheel={forwardScrollToPage}
          onTouchStart={() => {
            lastTouchY = null;
          }}
          onTouchMove={forwardTouchScrollToPage}
          onTouchEnd={() => {
            lastTouchY = null;
          }}
        />

        {/* SEARCH PANEL CONTAINER: Apple-Style Adaptive Liquid Glass Material */}
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            // Keep the default "focus the search input" behavior, but do it
            // without Radix fighting the page's own scroll position.
            event.preventDefault();
            (event.currentTarget as HTMLElement)
              .querySelector<HTMLInputElement>("input")
              ?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            // Non-modal dialogs otherwise try to restore focus in a way that
            // can yank scroll position back on close.
            event.preventDefault();
          }}
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
          className={cn(
            "relative isolate z-50 overflow-hidden sm:rounded-2xl outline-none",
            "dialog-content-motion",
            wide ? "w-[min(100%-2rem,56rem)] max-w-4xl" : "w-[min(100%-2rem,36rem)] sm:max-w-xl",
            "search-panel-liquid-glass",
            className,
          )}
        >
          {/*
            ===================================================================
            ADAPTIVE GLASS LAYER (Strictly scoped to the search panel body)
            Dynamically samples + refracts whatever is rendered behind the
            panel (posters, backdrops) in real time via backdrop-filter.
            Sits behind foreground content; never affects it.
            ===================================================================
          */}
          <AdaptiveLiquidGlass
            className="absolute inset-0 -z-10 rounded-[inherit]"
            radius="inherit"
          >
            {null}
          </AdaptiveLiquidGlass>

          {/*
            ===================================================================
            FOREGROUND CONTENT (Search Input, Trending Header, Poster Cards)
            Sits above glass layer at z-10, completely unaffected, sharp & opaque.
            ===================================================================
          */}
          <DialogTitle className="sr-only">Command menu</DialogTitle>
          <Command
            shouldFilter={shouldFilter}
            className="relative z-10 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-14 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="flex items-center border-b border-border/20 bg-transparent px-4 dark:border-white/10"
    cmdk-input-wrapper=""
  >
    <Search className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-14 w-full rounded-md bg-transparent py-4 text-base outline-none",
        "placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[min(60vh,360px)] overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-8 text-center text-sm text-muted-foreground"
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-foreground",
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm outline-none",
      "transition-colors duration-200",
      "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      "data-[selected=true]:bg-muted/70 data-[selected=true]:text-foreground data-[selected=true]:shadow-xs dark:data-[selected=true]:bg-white/[0.08]",
      "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

function CommandShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
