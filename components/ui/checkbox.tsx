"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "grid h-5 w-5 shrink-0 place-items-center rounded-1 border-2",
      className,
    )}
    style={{
      borderColor: "var(--gw-trailhead-deep)",
      background: props.checked ? "var(--gw-trailhead-deep)" : "var(--bg-3)",
    }}
    {...props}
  >
    <CheckboxPrimitive.Indicator>
      <Check size={14} color="var(--gw-prairie-cream)" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
