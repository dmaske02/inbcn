import "server-only";

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

type KycApplication = Readonly<{
  id: string;
  profileId: string;
  status: string;
  kycStatus: string;
}>;

type KycRepository = Readonly<{
  findOwnedApplication(profileId: string, applicationId: string): Promise<KycApplication | null>;
  markKycStarted(input: Readonly<{
    applicationId: string;
    profileId: string;
    provider: string;
    reference: string;
    startedAt: string;
  }>): Promise<boolean>;
  claimKycWebhook(input: Readonly<{
    eventId: string;
    eventType: string;
    signatureVerifiedAt: string;
  }>): Promise<"claimed" | "processed" | "retry">;
  findApplicationByKycReference(provider: string, reference: string): Promise<KycApplication | null>;
  applyKycResult(input: Readonly<{
    applicationId: string;
    provider: string;
    reference: string;
    applicationStatus: "kyc_pending" | "under_review";
    kycStatus: "failed" | "verified";
    legalName: string | null;
    adult: boolean | null;
    completedAt: string;
    processedAt: string;
  }>): Promise<boolean>;
  completeKycWebhook(input: Readonly<{ eventId: string; applicationId: string | null; processedAt: string }>): Promise<void>;
  failKycWebhook(input: Readonly<{ eventId: string; failureDetail: string }>): Promise<void>;
}>;

type ApplicationServiceDependencies = Readonly<{
  repository: KycRepository;
  provider: HostedKycProvider | null;
  providerName: string;
  now(): string;
  returnUrl: string;
}>;

type ApplicationDraftDependencies = Readonly<{
  uploadPortrait(file: File): Promise<Readonly<{ publicId: string; secureUrl: string }>>;
  insertApplication(input: Readonly<{
    profileId: string;
    fields: ReporterApplicationFields;
    publicPhotoId: string;
    publicPhotoUrl: string;
  }>): Promise<Readonly<{ id: string; status: string }>>;
  insertConsents(applicationId: string, profileId: string, receipts: readonly ConsentReceipt[]): Promise<void>;
  destroyPortrait(publicId: string): Promise<void>;
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
    const portrait = await dependencies.uploadPortrait(input.portrait);
    let application: Readonly<{ id: string; status: string }>;
    try {
      application = await dependencies.insertApplication({
        profileId: input.profileId,
        fields: input.fields,
        publicPhotoId: portrait.publicId,
        publicPhotoUrl: portrait.secureUrl,
      });
    } catch (error) {
      try {
        await dependencies.destroyPortrait(portrait.publicId);
      } catch {
        // The database failure is actionable; remote cleanup remains best effort.
      }
      throw error;
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
      const application = await dependencies.repository.findOwnedApplication(profileId, applicationId);
      if (!application) throw new KycServiceError("not-found", 404, "Application not found.");
      if (application.status !== "kyc_pending") {
        throw new KycServiceError("invalid-state", 409, "The application is not ready for identity verification.");
      }
      const session = await hostedProvider.createSession({
        applicationId,
        returnUrl: dependencies.returnUrl,
      });
      let url: URL;
      try {
        url = new URL(session.url);
      } catch {
        throw new KycServiceError("provider-result-invalid", 502, "The identity provider returned an invalid session.");
      }
      const reference = session.reference.trim();
      if (url.protocol !== "https:" || !reference || reference.length > 512) {
        throw new KycServiceError("provider-result-invalid", 502, "The identity provider returned an invalid session.");
      }
      const saved = await dependencies.repository.markKycStarted({
        applicationId,
        profileId,
        provider: dependencies.providerName,
        reference,
        startedAt: dependencies.now(),
      });
      if (!saved) throw new KycServiceError("invalid-state", 409, "The application changed before verification could start.");
      return { url: url.toString() } as const;
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
        signatureVerifiedAt: dependencies.now(),
      });
      if (receipt === "processed") return { duplicate: true, status: "processed" } as const;

      const application = await dependencies.repository.findApplicationByKycReference(
        dependencies.providerName,
        result.reference,
      );
      if (!application || application.status !== "kyc_pending") {
        await dependencies.repository.failKycWebhook({
          eventId: result.eventId,
          failureDetail: "application-not-pending",
        });
        return { duplicate: false, status: "ignored" } as const;
      }

      const verified = result.status === "verified"
        && result.adult === true
        && Boolean(result.legalName?.trim());
      const processedAt = dependencies.now();
      const updated = await dependencies.repository.applyKycResult({
        applicationId: application.id,
        provider: dependencies.providerName,
        reference: result.reference,
        applicationStatus: verified ? "under_review" : "kyc_pending",
        kycStatus: verified ? "verified" : "failed",
        legalName: verified ? result.legalName!.trim() : null,
        adult: result.adult ?? null,
        completedAt: result.verifiedAt,
        processedAt,
      });
      if (!updated) {
        await dependencies.repository.failKycWebhook({
          eventId: result.eventId,
          failureDetail: "application-state-conflict",
        });
        return { duplicate: false, status: "ignored" } as const;
      }
      await dependencies.repository.completeKycWebhook({
        eventId: result.eventId,
        applicationId: application.id,
        processedAt,
      });
      return { duplicate: false, status: verified ? "verified" : "failed" } as const;
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
    now: () => new Date().toISOString(),
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
    uploadPortrait: portraits.uploadProfilePhoto,
    insertApplication: repository.insertApplicationDraft,
    insertConsents: repository.insertConsentReceipts,
    destroyPortrait: portraits.destroyProfilePhoto,
  })(input);
}

export async function processKycWebhook(input: Readonly<{ rawBody: string; signature: string }>) {
  return (await runtimeService()).processKycWebhook(input);
}
