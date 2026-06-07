import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreationSubmit } from "./SubmitButtons";

export function CreatioBottomBar({
  cancelLabel = "Cancel",
  pendingLabel = "Please wait",
  submitLabel = "Next",
}: {
  cancelLabel?: string;
  pendingLabel?: string;
  submitLabel?: string;
}) {
  return (
    <div className="fixed w-full bottom-0 z-10 bg-white border-t h-24">
      <div className="flex items-center justify-between mx-auto px-5 lg:px-10 h-full">
        <Button variant="secondary" size="lg" asChild>
          <Link href="/">{cancelLabel}</Link>
        </Button>
        <CreationSubmit label={submitLabel} pendingLabel={pendingLabel} />
      </div>
    </div>
  );
}
