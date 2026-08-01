import { AccessState } from "@/features/admin/auth/access-state";

export default function ForbiddenPage() {
  return (
    <AccessState
      code="403"
      title="Access denied"
      description="This account is not authorized to access the INBCN editorial workspace."
    />
  );
}
