"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    title: string;
    description?: string;
  }
>(({ className, title, description, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className="fixed inset-0 z-40"
      style={{ background: "rgba(27, 36, 26, 0.5)" }}
    />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "gw card fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
        className,
      )}
      style={{ boxShadow: "var(--shadow-2)" }}
      {...props}
    >
      <div className="stack">
        <div className="row between">
          <DialogPrimitive.Title asChild>
            <h2>{title}</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="btn btn-ghost btn-icon" aria-label="Close">
            <X size={18} />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="t-small">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">
            {title}
          </DialogPrimitive.Description>
        )}
        {children}
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export { Dialog, DialogTrigger, DialogClose, DialogContent };
