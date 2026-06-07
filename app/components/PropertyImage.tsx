"use client";

import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";
import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type PropertyImageProps = Omit<ImageProps, "src" | "alt"> & {
  src?: string | null;
  alt: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
};

export function PropertyImage({
  src,
  alt,
  className,
  fallbackTitle = "No image available",
  fallbackDescription = "Photos are pending for this property.",
  fill,
  ...props
}: PropertyImageProps) {
  const [failed, setFailed] = useState(false);
  const shouldFallback = !src || failed;

  if (shouldFallback) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/50 p-6 text-center text-muted-foreground",
          fill ? "absolute inset-0" : "",
          className
        )}
      >
        <ImageIcon className="mb-3 h-8 w-8" />
        <p className="text-sm font-medium text-foreground">{fallbackTitle}</p>
        <p className="mt-1 max-w-xs text-xs">{fallbackDescription}</p>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      className={className}
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
