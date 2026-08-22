import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { ReporterApplicationFields } from "./application.model.ts";
import type { ConsentReceipt } from "./consent.model.ts";

export type KycWebhookResult = Readonly<{
  eventId: string;
  reference: string;
  status: "verified" | "failed";
  legalName?: string;
  adult?: boolean;
  verifiedAt: string;
}>;

export interface HostedKycProvider {
  createSession(input: Readonly<{ applicationId: string; returnUrl: string }>): Promise<Readonly<{ url: string; reference: string }>>;
  verifyWebhook(rawBody: string, signature: string): KycWebhookResult;
}

type KycRepository = Readonly<{
  reserveKycStart(input: Readonly<{
    applicationId: string;
    profileId: string;
  }>): Promise<string | null>;
  completeKycStart(input: Readonly<{
    applicationId: string;
    profileId: string;
    reservationToken: string;
    provider: string;
    reference: string;
  }>): Promise<boolean>;
  releaseKycStart(input: Readonly<{
    applicationId: string;
    profileId: string;
    reservationToken: string;
  }>): Promise<boolean>;
  claimKycWebhook(input: Readonly<{
    eventId: string;
    eventType: string;
  }>): Promise<
    | Readonly<{ state: "claimed"; token: string }>
    | Readonly<{ state: "busy" }>
    | Readonly<{ state: "processed" }>
  >;
  completeKycWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    provider: string;
    reference: string;
    verified: boolean;
    legalName: string | null;
    adult: boolean | null;
    verifiedAt: string;
  }>): Promise<boolean>;
  failKycWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    failureDetail: string;
  }>): Promise<boolean>;
}>;

type ApplicationServiceDependencies = Readonly<{
  repository: KycRepository;
  provider: HostedKycProvider | null;
  providerName: string;
  returnUrl: string;
}>;

type ApplicationDraftDependencies = Readonly<{
  randomId(): string;
  uploadPortrait(file: File, applicationId: string): Promise<Readonly<{ publicId: string; secureUrl: string }>>;
  insertApplication(input: Readonly<{
    applicationId: string;
    profileId: string;
    fields: ReporterApplicationFields;
    publicPhotoId: string;
    publicPhotoUrl: string;
  }>): Promise<Readonly<{ id: string; status: string }>>;
  recoverApplication(input: Readonly<{
    applicationId: string;
    profileId: string;
    publicPhotoId: string;
  }>): Promise<Readonly<{ id: string; status: string }> | null>;
  isPortraitReferenced(publicId: string): Promise<boolean>;
  insertConsents(applicationId: string, profileId: string, receipts: readonly ConsentReceipt[]): Promise<void>;
  destroyPortrait(publicId: string): Promise<void>;
  reportCleanupFailure(publicId: string): void;
}>;

export type KycServiceErrorCode =
  | "forbidden"
  | "invalid-kyc-signature"
  | "invalid-request"
  | "invalid-state"
  | "kyc-not-configured"
  | "not-found"
  | "provider-result-invalid";

export class KycServiceError extends Error {
  readonly code: KycServiceErrorCode;
  readonly httpStatus: number;

  constructor(
    code: KycServiceErrorCode,
    httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "KycServiceError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const webhookResultSchema = z.object({
  eventId: z.string().trim().min(1).max(256),
  reference: z.string().trim().min(1).max(512),
  status: z.enum(["verified", "failed"]),
  legalName: z.string().trim().min(1).max(120).optional(),
  adult: z.boolean().optional(),
  verifiedAt: z.iso.datetime({ offset: true }),
});

export function createApplicationDraftService(dependencies: ApplicationDraftDependencies) {
  return async (input: Readonly<{
    profileId: string;
    fields: ReporterApplicationFields;
    receipts: readonly ConsentReceipt[];
    portrait: File;
  }>) => {
    const applicationId = dependencies.randomId();
    const portrait = await dependencies.uploadPortrait(input.portrait, applicationId);
    let application: Readonly<{ id: string; status: string }> | null = null;
    try {
      application = await dependencies.insertApplication({
        applicationId,
        profileId: input.profileId,
        fields: input.fields,
        publicPhotoId: portrait.publicId,
        publicPhotoUrl: portrait.secureUrl,
      });
    } catch (error) {
      const definite = typeof error === "object"
        && error !== null
        && "definite" in error
        && error.definite === true;
      if (!definite) {
        try {
          const recovered = await dependencies.recoverApplication({
            applicationId,
            profileId: input.profileId,
            publicPhotoId: portrait.publicId,
          });
          if (recovered) {
            application = recovered;
          } else {
            dependencies.reportCleanupFailure(portrait.publicId);
            throw error;
          }
        } catch (recoveryError) {
          if (recoveryError !== error) dependencies.reportCleanupFailure(portrait.publicId);
          throw error;
        }
      } else {
        let referenced: boolean;
        try {
          referenced = await dependencies.isPortraitReferenced(portrait.publicId);
        } catch {
          dependencies.reportCleanupFailure(portrait.publicId);
          throw error;
        }
        if (referenced) {
          dependencies.reportCleanupFailure(portrait.publicId);
          throw error;
        }
        try {
          await dependencies.destroyPortrait(portrait.publicId);
        } catch {
          dependencies.reportCleanupFailure(portrait.publicId);
        }
        throw error;
      }
    }
    if (!application) {
      dependencies.reportCleanupFailure(portrait.publicId);
      throw new Error("Application persistence could not be reconciled.");
    }
    await dependencies.insertConsents(application.id, input.profileId, input.receipts);
    return application;
  };
}

export function createApplicationService(dependencies: ApplicationServiceDependencies) {
  function provider(): HostedKycProvider {
    if (!dependencies.provider) {
      throw new KycServiceError(
        "kyc-not-configured",
        503,
        "Hosted identity verification is not configured.",
      );
    }
    return dependencies.provider;
  }

  return {
    async startKycSession(profileId: string, applicationId: string) {
      const hostedProvider = provider();
      const reservationToken = await dependencies.repository.reserveKycStart({
        applicationId,
        profileId,
      });
      if (!reservationToken) {
        throw new KycServiceError("invalid-state", 409, "The application is not ready for identity verification.");
      }
      try {
        const session = await hostedProvider.createSession({
          applicationId,
          returnUrl: dependencies.returnUrl,
        });
        const reference = session.reference.trim();
        const url = new URL(session.url);
        if (url.protocol !== "https:" || !reference || reference.length > 512) {
          throw new KycServiceError("provider-result-invalid", 502, "The identity provider returned an invalid session.");
        }
        const saved = await dependencies.repository.completeKycStart({
          applicationId,
          profileId,
          reservationToken,
          provider: dependencies.providerName,
          reference,
        });
        if (!saved) {
          throw new KycServiceError("invalid-state", 409, "The application changed before verification could start.");
        }
        return { url: url.toString() } as const;
      } catch (error) {
        try {
          await dependencies.repository.releaseKycStart({
            applicationId,
            profileId,
            reservationToken,
          });
        } catch {
          // The five-minute database lease permits safe recovery.
        }
        if (error instanceof TypeError) {
          throw new KycServiceError("provider-result-invalid", 502, "The identity provider returned an invalid session.");
        }
        throw error;
      }
    },

    async processKycWebhook(input: Readonly<{ rawBody: string; signature: string }>) {
      const hostedProvider = provider();
      if (!input.signature.trim() || !input.rawBody) {
        throw new KycServiceError("invalid-request", 400, "The webhook request is incomplete.");
      }
      let untrustedResult: KycWebhookResult;
      try {
        untrustedResult = hostedProvider.verifyWebhook(input.rawBody, input.signature);
      } catch {
        throw new KycServiceError("invalid-kyc-signature", 401, "The webhook signature is invalid.");
      }
      const parsed = webhookResultSchema.safeParse(untrustedResult);
      if (!parsed.success) {
        throw new KycServiceError("provider-result-invalid", 502, "The identity provider returned an invalid result.");
      }
      const result = parsed.data;
      const receipt = await dependencies.repository.claimKycWebhook({
        eventId: result.eventId,
        eventType: `identity.${result.status}`,
      });
      if (receipt.state === "processed") return { duplicate: true, status: "processed" } as const;
      if (receipt.state === "busy") return { duplicate: true, status: "processing" } as const;

      const verified = result.status === "verified"
        && result.adult === true
        && Boolean(result.legalName?.trim());
      try {
        const completed = await dependencies.repository.completeKycWebhook({
          eventId: result.eventId,
          processingToken: receipt.token,
          provider: dependencies.providerName,
          reference: result.reference,
          verified,
          legalName: verified ? result.legalName!.trim() : null,
          adult: result.adult ?? null,
          verifiedAt: result.verifiedAt,
        });
        if (!completed) {
          await dependencies.repository.failKycWebhook({
            eventId: result.eventId,
            processingToken: receipt.token,
            failureDetail: "application-state-conflict",
          });
          return { duplicate: false, status: "ignored" } as const;
        }
        return { duplicate: false, status: verified ? "verified" : "failed" } as const;
      } catch (error) {
        try {
          await dependencies.repository.failKycWebhook({
            eventId: result.eventId,
            processingToken: receipt.token,
            failureDetail: "processing-failed",
          });
        } catch {
          // A failed write remains stale-lease reclaimable by a valid retry.
        }
        throw error;
      }
    },
  } as const;
}

async function runtimeService() {
  const [{ applicationRepository }, { env }] = await Promise.all([
    import("./application.repository.ts"),
    import("../../config/env.ts"),
  ]);
  return createApplicationService({
    repository: applicationRepository,
    // No provider adapter exists until the client approves and contracts one.
    provider: null,
    providerName: env.server.kyc.provider ?? "",
    returnUrl: env.public.appUrl ? new URL("/application", env.public.appUrl).toString() : "",
  });
}

export async function startKycSession(applicationId: string) {
  const { authorizeCurrentReporter } = await import("../auth/server.ts");
  const actor = await authorizeCurrentReporter();
  if (!actor.ok || actor.state !== "applicant") {
    throw new KycServiceError("forbidden", 403, "This account cannot start identity verification.");
  }
  return startKycSessionFor(actor.userId, applicationId);
}

export async function startKycSessionFor(profileId: string, applicationId: string) {
  return (await runtimeService()).startKycSession(profileId, applicationId);
}

export async function saveApplicationDraft(input: Readonly<{
  profileId: string;
  fields: ReporterApplicationFields;
  receipts: readonly ConsentReceipt[];
  portrait: File;
}>) {
  const [repository, portraits] = await Promise.all([
    import("./application.repository.ts"),
    import("./profile-photo.service.ts"),
  ]);
  return createApplicationDraftService({
    randomId: randomUUID,
    uploadPortrait: portraits.uploadProfilePhoto,
    insertApplication: repository.insertApplicationDraft,
    recoverApplication: repository.recoverApplicationDraft,
    isPortraitReferenced: repository.isProfilePhotoReferenced,
    insertConsents: repository.insertConsentReceipts,
    destroyPortrait: portraits.destroyProfilePhoto,
    reportCleanupFailure: (publicId) => {
      console.error("Profile portrait requires reconciliation.", { publicId });
    },
  })(input);
}

export async function processKycWebhook(input: Readonly<{ rawBody: string; signature: string }>) {
  return (await runtimeService()).processKycWebhook(input);
}
