import * as React from "react";

import { cn } from "@/lib/utils";

// shadcn/ui new-york input. Adjusted to the project: height and radius of FormField (h-12, rounded-lg) for touch
// targets, text-base on every screen (the readability floor), token background, no `dark:` color classes.
// The classes are exported like buttonVariants, so an .astro form without state can style a native input the same.
const inputClassName = cn(
  "h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
);

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputClassName, className)} {...props} />;
}

export { Input, inputClassName };
