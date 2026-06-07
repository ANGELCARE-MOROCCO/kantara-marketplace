"use client";

/* eslint-disable @next/next/no-img-element */

import { type CSSProperties, useState } from "react";

import { cn } from "@/lib/utils";
import {
  getLogoDisplaySize,
  type SiteBrandingView,
} from "@/app/lib/homepageConfig";

export function ConfigurableLogo({
  branding,
  compact = false,
  className,
}: {
  branding: SiteBrandingView;
  compact?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const displayMode = branding.logoDisplayMode || "image_text";
  const logoSize = getLogoDisplaySize(branding, compact);
  const imageStyle: CSSProperties = {
    width: `${logoSize.width}px`,
    height: logoSize.height ? `${logoSize.height}px` : "auto",
    maxHeight: `${logoSize.maxHeight}px`,
    maxWidth: "100%",
  };
  const shouldAttemptImage =
    branding.showLogo &&
    displayMode !== "text" &&
    Boolean(branding.logoUrl) &&
    !failed;
  const shouldShowImageFailureText =
    failed && branding.showLogo && displayMode !== "text";
  const shouldShowText =
    shouldShowImageFailureText ||
    (branding.showBrandName &&
      (displayMode !== "image" || !shouldAttemptImage || failed));
  const fallbackText = branding.brandName || "Kantara";

  if (!shouldAttemptImage && !shouldShowText) {
    return <span className="sr-only">{fallbackText}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center",
        compact ? "gap-2" : "gap-3",
        className
      )}
    >
      {shouldAttemptImage ? (
        <img
          src={branding.logoUrl ?? ""}
          alt={branding.logoAltText ?? fallbackText}
          width={logoSize.width}
          height={logoSize.height ?? undefined}
          className="block shrink-0 object-contain"
          style={imageStyle}
          onError={() => setFailed(true)}
        />
      ) : null}
      {shouldShowText ? (
        <span
          className={cn(
            "min-w-0 truncate font-semibold tracking-normal text-stone-950",
            compact ? "max-w-[8rem] text-sm" : "max-w-[13rem] text-base"
          )}
        >
          {fallbackText}
        </span>
      ) : null}
    </span>
  );
}
