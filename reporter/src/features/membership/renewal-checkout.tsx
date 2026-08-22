"use client";

import { ReporterCheckout } from "../payments/reporter-checkout";

export function RenewalCheckout({
  keyId,
  disabled,
}: Readonly<{ keyId?: string; disabled: boolean }>) {
  return (
    <ReporterCheckout
      applicationId={null}
      disabled={disabled}
      keyId={keyId}
      purpose="renewal"
    />
  );
}
