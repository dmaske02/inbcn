type SyncCompletion = Readonly<{
  state: "succeeded" | "failed" | "stale" | "expired";
  generation: number;
}>;

type TemporaryOnboardingDependencies = Readonly<{
  completePayment: (profileId: string, applicationId: string) => Promise<Readonly<{ state: "completed" }>>;
  approve: (profileId: string, applicationId: string) => Promise<Readonly<{ profileId: string; generation: number }>>;
  claimSync: (profileId: string) => Promise<
    | Readonly<{ state: "busy"; generation: number }>
    | Readonly<{ state: "succeeded"; generation: number }>
    | Readonly<{ state: "claimed"; profileId: string; generation: number; claimToken: string }>
  >;
  getAuthMetadata: (profileId: string) => Promise<Readonly<Record<string, unknown>>>;
  updateAuthClaims: (profileId: string, metadata: Readonly<Record<string, unknown>>) => Promise<void>;
  completeSync: (input: Readonly<{
    profileId: string;
    generation: number;
    claimToken: string;
    succeeded: boolean;
    failureDetail: "auth-claim-update-failed" | null;
  }>) => Promise<SyncCompletion>;
  refreshSession: () => Promise<void>;
}>;

export class TemporaryOnboardingError extends Error {
  constructor() {
    super("unavailable");
  }
}

export function createTemporaryOnboardingService(dependencies: TemporaryOnboardingDependencies) {
  return {
    async completePayment(profileId: string, applicationId: string): Promise<void> {
      try {
        await dependencies.completePayment(profileId, applicationId);
      } catch {
        throw new TemporaryOnboardingError();
      }
    },

    async completeKycAndApproval(profileId: string, applicationId: string): Promise<void> {
      let approval: Awaited<ReturnType<TemporaryOnboardingDependencies["approve"]>>;
      let claim: Awaited<ReturnType<TemporaryOnboardingDependencies["claimSync"]>>;
      try {
        approval = await dependencies.approve(profileId, applicationId);
        claim = await dependencies.claimSync(profileId);
      } catch {
        throw new TemporaryOnboardingError();
      }

      if (approval.profileId !== profileId || claim.generation !== approval.generation) {
        throw new TemporaryOnboardingError();
      }
      if (claim.state === "busy") throw new TemporaryOnboardingError();
      if (claim.state === "succeeded") {
        try {
          await dependencies.refreshSession();
          return;
        } catch {
          throw new TemporaryOnboardingError();
        }
      }
      if (claim.profileId !== profileId) throw new TemporaryOnboardingError();

      try {
        const metadata = await dependencies.getAuthMetadata(profileId);
        await dependencies.updateAuthClaims(profileId, {
          ...metadata,
          role: "reporter",
          reporter_access_generation: claim.generation,
        });
      } catch {
        try {
          await dependencies.completeSync({
            profileId,
            generation: claim.generation,
            claimToken: claim.claimToken,
            succeeded: false,
            failureDetail: "auth-claim-update-failed",
          });
        } catch {
          // The exact lease can be retried safely by the next request.
        }
        throw new TemporaryOnboardingError();
      }

      try {
        const completion = await dependencies.completeSync({
          profileId,
          generation: claim.generation,
          claimToken: claim.claimToken,
          succeeded: true,
          failureDetail: null,
        });
        if (completion.state !== "succeeded" || completion.generation !== claim.generation) {
          throw new TemporaryOnboardingError();
        }
        await dependencies.refreshSession();
      } catch {
        throw new TemporaryOnboardingError();
      }
    },
  };
}
