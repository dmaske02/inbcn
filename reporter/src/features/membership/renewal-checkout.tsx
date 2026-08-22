"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CheckoutResponse = Readonly<{
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}>;

type RazorpayOptions = Readonly<{
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler(response: CheckoutResponse): void;
  modal: Readonly<{ ondismiss(): void }>;
}>;

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open(): void };
  }
}

type State = Readonly<{
  kind: "idle" | "busy" | "error" | "success";
  message?: string;
}>;

function exactOrder(value: unknown): Readonly<{
  orderId: string;
  amount: number;
  currency: string;
}> | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  return typeof order.orderId === "string"
    && order.amount === 10_000
    && order.currency === "INR"
    ? { orderId: order.orderId, amount: order.amount, currency: order.currency }
    : null;
}

export function RenewalCheckout({
  keyId,
  disabled,
}: Readonly<{ keyId?: string; disabled: boolean }>) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function renew(): Promise<void> {
    if (disabled || !keyId || !scriptReady || !window.Razorpay) return;
    setState({ kind: "busy", message: "Creating your secure ₹100 renewal order…" });
    try {
      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "renewal", applicationId: null }),
      });
      const order = exactOrder(await response.json());
      if (!response.ok || !order) throw new Error("order-failed");

      const checkout = new window.Razorpay({
        key: keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "INBCN",
        description: "One-year reporter membership renewal",
        handler: (result) => {
          void (async () => {
            setState({ kind: "busy", message: "Verifying the captured payment…" });
            try {
              const verification = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  orderId: result.razorpay_order_id,
                  paymentId: result.razorpay_payment_id,
                  signature: result.razorpay_signature,
                }),
              });
              if (!verification.ok && verification.status !== 202) {
                throw new Error("verification-failed");
              }
              setState({
                kind: "success",
                message: verification.status === 202
                  ? "Payment is being confirmed. Membership will update after provider confirmation."
                  : "Membership renewed successfully.",
              });
              router.refresh();
            } catch {
              setState({
                kind: "error",
                message: "Payment verification is still pending. Do not pay again; refresh shortly.",
              });
            }
          })();
        },
        modal: {
          ondismiss: () => setState({ kind: "idle", message: "Renewal checkout closed." }),
        },
      });
      checkout.open();
    } catch {
      setState({ kind: "error", message: "Renewal could not start. Please try again." });
    }
  }

  const unavailable = disabled || !keyId || !scriptReady || state.kind === "busy";
  return (
    <div className="space-y-3">
      <Script
        onError={() => setState({ kind: "error", message: "Secure checkout could not load." })}
        onLoad={() => setScriptReady(true)}
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />
      <button
        className="w-full rounded-md bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={disabled || unavailable}
        onClick={() => void renew()}
        type="button"
      >
        {state.kind === "busy" ? "Processing…" : "Renew one year for ₹100"}
      </button>
      {!keyId ? (
        <p className="text-sm text-muted-foreground">Renewal checkout is not configured.</p>
      ) : null}
      {state.message ? (
        <p
          aria-live="polite"
          className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role={state.kind === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
