import { AccessState } from "@/features/admin/auth/access-state";

export default function UnauthorizedPage() {
  return (
    <AccessState
      code="401"
      title="Authorization could not be verified"
      description="We could not verify your newsroom access. Sign in again, or contact an administrator if the issue continues."
    />
  );
}
