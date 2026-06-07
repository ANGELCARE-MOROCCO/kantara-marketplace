"use client";

import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  message: string;
  children: ReactNode;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
};

export function ConfirmSubmitButton({
  message,
  children,
  variant = "outline",
  className,
}: ConfirmSubmitButtonProps) {
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </Button>
  );
}
