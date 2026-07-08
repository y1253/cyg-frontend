"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  indeterminate,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background shadow-sm outline-none transition-colors",
        "hover:border-teal-500/70",
        "focus-visible:ring-2 focus-visible:ring-teal-500/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:border-teal-600 data-[checked]:bg-teal-600 data-[checked]:text-white",
        "data-[indeterminate]:border-teal-600 data-[indeterminate]:bg-teal-600 data-[indeterminate]:text-white",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        className="flex items-center justify-center text-current data-[unchecked]:opacity-0"
      >
        {indeterminate ? (
          <MinusIcon className="size-3.5" strokeWidth={3} />
        ) : (
          <CheckIcon className="size-3.5" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
