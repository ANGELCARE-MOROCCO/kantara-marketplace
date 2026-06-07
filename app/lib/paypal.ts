import "server-only";

export type PayPalEnvironment = "sandbox" | "live";

export type PayPalProviderStatus =
  | "not_configured"
  | "missing_client_id"
  | "missing_secret"
  | "sandbox_ready"
  | "live_ready"
  | "webhook_unverified";

export type PayPalOrderIntent = "CAPTURE" | "AUTHORIZE";

export type PayPalOrderResponse = {
  id?: string;
  status?: string;
  intent?: string;
  links?: { href: string; rel: string; method?: string }[];
  purchase_units?: {
    payments?: {
      captures?: { id?: string; status?: string }[];
      authorizations?: { id?: string; status?: string }[];
    };
  }[];
  message?: string;
  name?: string;
  details?: unknown;
};

export type NormalizedPayPalError = {
  message: string;
  status?: number;
  name?: string;
};

function getPayPalEnvironment(): PayPalEnvironment {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

export function getPayPalBaseUrl(environment: PayPalEnvironment = getPayPalEnvironment()) {
  return environment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function getPayPalProviderReadiness() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || "";
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() || "";
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim() || "";
  const publicClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || "";
  const environment = getPayPalEnvironment();

  let status: PayPalProviderStatus;
  if (!clientId && !secret) status = "not_configured";
  else if (!clientId) status = "missing_client_id";
  else if (!secret) status = "missing_secret";
  else status = environment === "live" ? "live_ready" : "sandbox_ready";

  return {
    provider: "paypal",
    environment,
    displayEnvironment: clientId || secret ? environment : "not configured",
    status,
    isConfigured: Boolean(clientId && secret),
    hasClientId: Boolean(clientId),
    hasSecret: Boolean(secret),
    hasWebhookId: Boolean(webhookId),
    hasPublicClientId: Boolean(publicClientId),
    ordersApiReady: Boolean(clientId && secret),
    captureReady: Boolean(clientId && secret),
    authorizeReady: Boolean(clientId && secret),
    webhookReady: Boolean(webhookId),
    cardFieldsStatus: publicClientId
      ? "unknown_until_runtime"
      : "card_fields_unavailable",
  };
}

export function normalizePayPalError(error: unknown): NormalizedPayPalError {
  if (error && typeof error === "object" && "message" in error) {
    const details = error as { message?: unknown; status?: unknown; name?: unknown };
    const message = String(details.message ?? "PayPal request failed.");
    return {
      message: message.replaceAll(process.env.PAYPAL_CLIENT_SECRET ?? "__paypal_secret_not_set__", "[redacted]").slice(0, 300),
      status: typeof details.status === "number" ? details.status : undefined,
      name: typeof details.name === "string" ? details.name : undefined,
    };
  }

  return { message: "PayPal request failed." };
}

async function getAccessToken() {
  const readiness = getPayPalProviderReadiness();
  if (!readiness.isConfigured) {
    throw new Error("PayPal is not configured.");
  }

  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const credentials = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl(readiness.environment)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await readPayPalJson(response)) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description ?? `PayPal token request failed with ${response.status}.`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload.access_token;
}

async function readPayPalJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: `PayPal returned a non-JSON response with status ${response.status}.` };
  }
}

async function paypalRequest<T>({
  path,
  method = "GET",
  body,
}: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<T> {
  const readiness = getPayPalProviderReadiness();
  const accessToken = await getAccessToken();
  const response = await fetch(`${getPayPalBaseUrl(readiness.environment)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = (await readPayPalJson(response)) as T & { message?: string; name?: string; details?: unknown };

  if (!response.ok) {
    const error = new Error(payload.message ?? payload.name ?? `PayPal request failed with ${response.status}.`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}

export async function createPayPalOrder({
  amount,
  currency,
  referenceId,
  description,
  intent = "CAPTURE",
}: {
  amount: string;
  currency: string;
  referenceId: string;
  description: string;
  intent?: PayPalOrderIntent;
}) {
  return paypalRequest<PayPalOrderResponse>({
    path: "/v2/checkout/orders",
    method: "POST",
    body: {
      intent,
      purchase_units: [
        {
          reference_id: referenceId,
          description: description.slice(0, 120),
          amount: {
            currency_code: currency,
            value: amount,
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            user_action: intent === "CAPTURE" ? "PAY_NOW" : "CONTINUE",
          },
        },
      },
    },
  });
}

export async function capturePayPalOrder(orderId: string) {
  return paypalRequest<PayPalOrderResponse>({
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    method: "POST",
    body: {},
  });
}

export async function authorizePayPalOrder(orderId: string) {
  return paypalRequest<PayPalOrderResponse>({
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    method: "POST",
    body: {},
  });
}

export async function getPayPalOrder(orderId: string) {
  return paypalRequest<PayPalOrderResponse>({
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  });
}

export async function verifyPayPalWebhookSignature({
  transmissionId,
  transmissionTime,
  transmissionSignature,
  certificateUrl,
  authAlgorithm,
  webhookEvent,
}: {
  transmissionId: string;
  transmissionTime: string;
  transmissionSignature: string;
  certificateUrl: string;
  authAlgorithm: string;
  webhookEvent: unknown;
}) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) return { verified: false, status: "disabled" as const };

  const response = await paypalRequest<{ verification_status?: string }>({
    path: "/v1/notifications/verify-webhook-signature",
    method: "POST",
    body: {
      auth_algo: authAlgorithm,
      cert_url: certificateUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSignature,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    },
  });

  return {
    verified: response.verification_status === "SUCCESS",
    status: response.verification_status ?? "UNKNOWN",
  };
}

export function extractPayPalApprovalUrl(order: PayPalOrderResponse) {
  return order.links?.find((link) => link.rel === "approve")?.href ?? null;
}

export function extractPayPalCaptureId(order: PayPalOrderResponse) {
  return order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? [])[0]?.id ?? null;
}

export function extractPayPalAuthorizationId(order: PayPalOrderResponse) {
  return order.purchase_units?.flatMap((unit) => unit.payments?.authorizations ?? [])[0]?.id ?? null;
}
