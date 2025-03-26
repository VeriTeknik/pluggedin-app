import * as React from "react";
import { cn } from "@/lib/utils";

interface GlowProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "bottom" | "top" | "left" | "right" | "center";
}

export function Glow({
  className,
  variant = "center",
  ...props
}: GlowProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute select-none",
        {
          "bottom-0 left-1/2 h-[30vh] w-[80%] -translate-x-1/2 translate-y-1/4": variant === "bottom",
          "top-0 left-1/2 h-[30vh] w-[80%] -translate-x-1/2 -translate-y-1/4": variant === "top",
          "left-0 top-1/2 h-[80%] w-[30vw] -translate-x-1/4 -translate-y-1/2": variant === "left",
          "right-0 top-1/2 h-[80%] w-[30vw] translate-x-1/4 -translate-y-1/2": variant === "right",
          "left-1/2 top-1/2 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2": variant === "center",
        },
        "rounded-full bg-gradient-to-r from-purple-500/20 via-violet-500/20 to-indigo-500/20 opacity-80 blur-[100px]",
        className
      )}
      {...props}
    />
  );
} 