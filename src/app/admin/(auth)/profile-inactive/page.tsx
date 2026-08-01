import { AccessState } from "@/features/admin/auth/access-state";

export default function ProfileInactivePage() {
  return (
    <AccessState
      code="403"
      title="Account inactive"
      description="Your newsroom profile is currently inactive. Contact an administrator to restore access."
    />
  );
}
