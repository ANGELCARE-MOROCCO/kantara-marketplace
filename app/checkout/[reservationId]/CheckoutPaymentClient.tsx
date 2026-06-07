"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Loader2,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type CheckoutState =
  | "not_configured"
  | "ready"
  | "loading_sdk"
  | "sdk_ready"
  | "pending_approval"
  | "capturing"
  | "captured"
  | "failed"
  | "requires_review"
  | "already_paid"
  | "cancelled";

type CheckoutPaymentClientProps = {
  reservationId: string;
  initialPaymentRecordId?: string | null;
  publicClientId?: string | null;
  providerConfigured: boolean;
  providerEnvironment: string;
  amountLabel: string;
  currency: string;
  initialState: CheckoutState;
  initialCaptureId?: string | null;
};

type PayPalButtonsOptions = {
  style?: Record<string, string | number | boolean>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
};

type PayPalCardFieldsFactory = () => {
  isEligible?: () => boolean;
};

declare global {
  interface Window {
    paypal?: {
      Buttons?: (options: PayPalButtonsOptions) => {
        render: (element: HTMLElement | string) => Promise<void>;
        close?: () => void;
      };
      CardFields?: PayPalCardFieldsFactory;
    };
  }
}

function safeMessage(value: unknown) {
  if (value && typeof value === "object" && "error" in value) {
    return String((value as { error?: unknown }).error ?? "Payment failed.");
  }
  return "Payment failed. Please try again or contact Kantara support.";
}

export function CheckoutPaymentClient({
  reservationId,
  initialPaymentRecordId,
  publicClientId,
  providerConfigured,
  providerEnvironment,
  amountLabel,
  currency,
  initialState,
  initialCaptureId,
}: CheckoutPaymentClientProps) {
  const buttonsRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);
  const [state, setState] = useState<CheckoutState>(initialState);
  const [paymentRecordId, setPaymentRecordId] = useState(initialPaymentRecordId ?? null);
  const [captureId, setCaptureId] = useState(initialCaptureId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [cardFieldsState, setCardFieldsState] = useState<"unknown" | "available" | "unavailable">(
    publicClientId ? "unknown" : "unavailable"
  );

  const canLoadPayPal = providerConfigured && Boolean(publicClientId) && ["ready", "pending_approval"].includes(initialState);
  const sdkUrl = useMemo(() => {
    if (!publicClientId) return null;
    const params = new URLSearchParams({
      "client-id": publicClientId,
      currency,
      intent: "capture",
      components: "buttons,card-fields",
    });
    return `https://www.paypal.com/sdk/js?${params.toString()}`;
  }, [currency, publicClientId]);

  useEffect(() => {
    if (!canLoadPayPal || !sdkUrl || renderedRef.current) return;

    let cancelled = false;
    const paypalSdkUrl = sdkUrl;

    async function loadSdk() {
      setState("loading_sdk");
      if (!document.querySelector(`script[src="${paypalSdkUrl}"]`)) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = paypalSdkUrl;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("PayPal checkout could not be loaded."));
          document.body.appendChild(script);
        });
      }

      if (cancelled || !buttonsRef.current) return;
      if (!window.paypal?.Buttons) {
        setState("failed");
        setMessage("PayPal checkout is unavailable in this browser session.");
        return;
      }

      try {
        const cardFields = window.paypal.CardFields?.();
        setCardFieldsState(cardFields?.isEligible?.() ? "available" : "unavailable");
      } catch {
        setCardFieldsState("unavailable");
      }

      renderedRef.current = true;
      setState("sdk_ready");
      await window.paypal.Buttons({
        style: {
          layout: "vertical",
          shape: "rect",
          label: "pay",
        },
        async createOrder() {
          setState("pending_approval");
          setMessage(null);
          const response = await fetch("/api/payments/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reservationId,
              paymentRecordId,
              intent: "CAPTURE",
              method: "paypal_card",
              source: "guest_checkout",
            }),
          });
          const payload = (await response.json()) as {
            ok?: boolean;
            error?: string;
            providerOrderId?: string;
            paymentRecordId?: string;
          };
          if (!response.ok || !payload.ok || !payload.providerOrderId) {
            throw new Error(payload.error ?? "PayPal order could not be created.");
          }
          setPaymentRecordId(payload.paymentRecordId ?? null);
          return payload.providerOrderId;
        },
        async onApprove(data) {
          setState("capturing");
          const response = await fetch("/api/payments/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentRecordId,
              orderId: data.orderID,
            }),
          });
          const payload = (await response.json()) as {
            ok?: boolean;
            error?: string;
            captureId?: string | null;
            paymentRecordId?: string;
          };
          if (!response.ok || !payload.ok) {
            setState("requires_review");
            setMessage(payload.error ?? "PayPal capture failed. Kantara support can review the payment record.");
            if (payload.paymentRecordId) setPaymentRecordId(payload.paymentRecordId);
            return;
          }
          setCaptureId(payload.captureId ?? null);
          setPaymentRecordId(payload.paymentRecordId ?? paymentRecordId);
          setState("captured");
          setMessage("Payment captured successfully.");
        },
        onCancel() {
          setState("sdk_ready");
          setMessage("PayPal checkout was cancelled before capture.");
        },
        onError(error) {
          setState("failed");
          setMessage(error instanceof Error ? error.message : "PayPal checkout failed.");
        },
      }).render(buttonsRef.current);
    }

    loadSdk().catch((error) => {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "PayPal checkout could not be loaded.");
    });

    return () => {
      cancelled = true;
    };
  }, [canLoadPayPal, currency, initialState, paymentRecordId, publicClientId, reservationId, sdkUrl]);

  if (!providerConfigured || state === "not_configured") {
    return (
      <CheckoutStatePanel
        tone="warning"
        title="PayPal checkout is not configured"
        message="PayPal server credentials must be configured before payment can be accepted."
      />
    );
  }

  if (!publicClientId) {
    return (
      <CheckoutStatePanel
        tone="warning"
        title="PayPal public client ID is missing"
        message="NEXT_PUBLIC_PAYPAL_CLIENT_ID is required for the PayPal checkout SDK. No payment attempt was made."
      />
    );
  }

  if (state === "already_paid" || state === "captured") {
    return (
      <CheckoutStatePanel
        tone="success"
        title="Payment captured"
        message={message ?? `Your ${amountLabel} payment is recorded for this reservation.`}
        detail={captureId ? `PayPal capture/reference: ${captureId}` : "Capture reference is recorded in the payment operations center."}
      />
    );
  }

  if (state === "cancelled") {
    return (
      <CheckoutStatePanel
        tone="danger"
        title="Reservation is cancelled"
        message="Payment is not available for a cancelled reservation."
      />
    );
  }

  if (state === "requires_review") {
    return (
      <CheckoutStatePanel
        tone="warning"
        title="Payment needs review"
        message={message ?? "This payment needs Kantara operations review before another attempt."}
      />
    );
  }

  if (state === "failed") {
    return (
      <div className="space-y-4">
        <CheckoutStatePanel
          tone="danger"
          title="Payment could not be completed"
          message={message ?? "No raw provider error details are shown. You can retry or contact Kantara support."}
        />
        <Button type="button" variant="outline" className="border-slate-300 bg-white shadow-sm hover:border-slate-500" onClick={() => window.location.reload()}>
          Retry checkout
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
      <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/10">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Payment panel</p>
            <h2 className="mt-1 text-xl font-semibold">Secure PayPal payment</h2>
            <p className="mt-2 text-sm leading-5 text-slate-300">
              Approve {amountLabel} through PayPal hosted checkout.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white">
          {state === "loading_sdk" || state === "capturing" ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          ) : (
            <CreditCard className="h-5 w-5 text-slate-600" />
          )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold">Hosted checkout ready</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Card details are handled by PayPal. Kantara does not store card numbers or CVV.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <PaymentCapability icon={<ShieldCheck className="h-4 w-4" />} label="Provider environment" value={providerEnvironment} />
          <PaymentCapability icon={<CreditCard className="h-4 w-4" />} label="Card fields" value={cardFieldsState.replaceAll("_", " ")} />
          <PaymentCapability icon={<LockKeyhole className="h-4 w-4" />} label="Card storage" value="Handled by PayPal" />
          <PaymentCapability icon={<ReceiptText className="h-4 w-4" />} label="Reservation amount" value={amountLabel} />
        </div>

        {cardFieldsState === "unknown" && (state === "loading_sdk" || state === "ready") ? (
          <div className="mt-4 grid gap-2" aria-label="Loading PayPal checkout">
            <div className="h-3 rounded-full bg-slate-100" />
            <div className="h-3 w-5/6 rounded-full bg-slate-100" />
            <div className="h-11 rounded-md bg-slate-100" />
          </div>
        ) : null}

        {cardFieldsState === "unavailable" ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
            Card fields are not available for this account or environment. You can still pay securely through PayPal checkout.
          </div>
        ) : null}

        <div className="mt-5 rounded-md border border-slate-200 bg-white p-3">
          <div ref={buttonsRef} className="min-h-12" />
        </div>
        {message ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-700">
            {message}
          </div>
        ) : null}
        <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Hosted PayPal checkout is used for approval and card handling. No raw card form posts to Kantara.</p>
        </div>
      </div>
    </div>
  );
}

function PaymentCapability({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 break-words font-semibold capitalize text-slate-900">{value}</p>
    </div>
  );
}

function CheckoutStatePanel({
  tone,
  title,
  message,
  detail,
}: {
  tone: "success" | "warning" | "danger";
  title: string;
  message: string;
  detail?: string;
}) {
  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-950"
        : "border-amber-200 bg-amber-50 text-amber-950";
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : AlertTriangle;
  const accent =
    tone === "success"
      ? "border-emerald-200 bg-white/70"
      : tone === "danger"
        ? "border-red-200 bg-white/70"
        : "border-amber-200 bg-white/70";

  return (
    <div className={`rounded-lg border p-5 shadow-sm ${classes}`}>
      <div className="flex gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border ${accent}`}>
          {tone === "success" ? <BadgeCheck className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-5">{message}</p>
          {detail ? <p className="mt-3 break-words rounded-md border border-current/15 bg-white/50 p-3 text-sm font-medium">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}
