import { AccessState } from "@/features/admin/auth/access-state";

export default function SessionExpiredPage() {
  return (
    <AccessState
      code="401"
      title="Your session has expired"
      description="For your security, please sign in again to continue to the editorial workspace."
    />
  );
}
