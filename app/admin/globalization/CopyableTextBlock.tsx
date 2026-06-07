"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyableTextBlock({
  text,
}: {
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        readOnly
        value={text}
        className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6"
      />
      <Button type="button" variant="outline" className="gap-2" onClick={copyText}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy prompt"}
      </Button>
    </div>
  );
}
