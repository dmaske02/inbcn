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

type RazorpayInstance = Readonly<{
  open(): void;
  on(event: "payment.failed", handler: () => void): void;
}>;

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type CheckoutState = Readonly<{
  kind: "idle" | "busy" | "error" | "success";
  message?: string;
}>;

type CheckoutScriptState = "loading" | "ready" | "error";

const CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type CheckoutProps = Readonly<{
  purpose: "application" | "renewal";
  applicationId: string | null;
  keyId?: string;
  disabled?: boolean;
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

function exactVerification(value: unknown): "captured" | "pending" | null {
  if (!value || typeof value !== "object" || !("status" in value)) return null;
  return value.status === "captured" || value.status === "pending" ? value.status : null;
}

export function ReporterCheckout({
  purpose,
  applicationId,
  keyId,
  disabled = false,
}: CheckoutProps) {
  const router = useRouter();
  const [scriptAttempt, setScriptAttempt] = useState(0);
  const [scriptState, setScriptState] = useState<CheckoutScriptState>("loading");
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });
  const [verificationReceipt, setVerificationReceipt] = useState<CheckoutResponse | null>(null);
  const application = purpose === "application";
  const scriptUrl = scriptAttempt === 0
    ? CHECKOUT_SCRIPT_URL
    : `${CHECKOUT_SCRIPT_URL}?inbcn_retry=${scriptAttempt}`;

  function checkoutScriptReady(): void {
    if (!window.Razorpay) {
      setScriptState("error");
      setState({ kind: "error", message: "Secure checkout could not load. Try again." });
      return;
    }
    setScriptState("ready");
    setState((current) => current.kind === "busy"
      ? { kind: "idle", message: "Secure checkout loaded. Select payment when ready." }
      : current);
  }

  async function verify(result: CheckoutResponse): Promise<void> {
    setState({ kind: "busy", message: "Verifying the captured payment…" });
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: result.razorpay_order_id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        }),
      });
      const verification = exactVerification(await response.json());
      if ((response.status !== 200 && response.status !== 202)
        || verification === null
        || (response.status === 202 && verification !== "pending")
        || (response.status === 200 && verification !== "captured")) {
        throw new Error("verification-failed");
      }
      setState({
        kind: "success",
        message: verification === "pending"
          ? "Payment is being confirmed. Your account will update after provider confirmation."
          : application
            ? "Payment confirmed. You can continue to identity verification."
            : "Membership renewed successfully.",
      });
      if (verification === "captured") {
        setVerificationReceipt(null);
        router.refresh();
      }
    } catch {
      setState({
        kind: "error",
        message: "Payment confirmation is pending. Do not pay again; refresh this page shortly.",
      });
    }
  }

  async function openCheckout(): Promise<void> {
    if (disabled || !keyId) return;
    if (verificationReceipt) {
      await verify(verificationReceipt);
      return;
    }
    if (scriptState !== "ready" || !window.Razorpay) {
      setScriptState("loading");
      setState({ kind: "busy", message: "Loading secure checkout…" });
      setScriptAttempt((attempt) => attempt + 1);
      return;
    }
    setState({
      kind: "busy",
      message: application
        ? "Creating or resuming your secure ₹100 application order…"
        : "Creating or resuming your secure ₹100 renewal order…",
    });
    try {
      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose, applicationId }),
      });
      const order = exactOrder(await response.json());
      if (!response.ok || !order) throw new Error("order-failed");

      let checkoutResolved = false;
      const checkout = new window.Razorpay({
        key: keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "INBCN",
        description: application ? "Reporter application fee" : "One-year reporter membership renewal",
        handler: (result) => {
          checkoutResolved = true;
          setVerificationReceipt(result);
          void verify(result);
        },
        modal: {
          ondismiss: () => {
            if (!checkoutResolved) {
              setState({ kind: "idle", message: "Secure checkout closed. No payment was confirmed." });
            }
          },
        },
      });
      checkout.on("payment.failed", () => {
        checkoutResolved = true;
        setVerificationReceipt(null);
        setState({ kind: "error", message: "The payment provider could not complete this payment. Try again when ready." });
      });
      checkout.open();
    } catch {
      setState({ kind: "error", message: "Secure checkout could not start. Try again." });
    }
  }

  const unavailable = disabled || !keyId || scriptState === "loading" || state.kind === "busy";
  const defaultLabel = application ? "Pay application fee · ₹100" : "Renew one year for ₹100";

  return (
    <div className="space-y-3">
      {keyId ? (
        <Script
          key={scriptAttempt}
          onError={() => {
            setScriptState("error");
            setState({ kind: "error", message: "Secure checkout could not load. Try again." });
          }}
          onLoad={checkoutScriptReady}
          onReady={checkoutScriptReady}
          src={scriptUrl}
          strategy="afterInteractive"
        />
      ) : null}
      <button
        className="w-full rounded-md bg-foreground px-4 py-3 font-medium text-background disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={unavailable}
        onClick={() => void openCheckout()}
        type="button"
      >
        {state.kind === "busy"
          ? "Processing…"
          : verificationReceipt
            ? "Check payment status"
            : state.kind === "error"
              ? `Try again · ${defaultLabel}`
              : defaultLabel}
      </button>
      {!keyId ? <p className="text-sm text-muted-foreground">Secure checkout is not configured.</p> : null}
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
