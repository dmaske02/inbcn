import { AccessState } from "@/features/admin/auth/access-state";

export default function RoleMismatchPage() {
  return (
    <AccessState
      code="403"
      title="Account permissions require review"
      description="Your account permissions could not be confirmed. Contact an administrator before trying again."
    />
  );
}
