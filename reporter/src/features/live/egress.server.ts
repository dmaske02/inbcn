import "server-only";

import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  S3Upload,
  ServerError,
} from "livekit-server-sdk";

export type PrivateStorageConfig = Readonly<{
  accessKey: string;
  secret: string;
  bucket: string;
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
}>;

type EgressClientBoundary = Pick<EgressClient, "listEgress" | "startRoomCompositeEgress">;

export type RecordingStartResult =
  | Readonly<{ state: "started"; egressId: string }>
  | Readonly<{ state: "definitive-failure" }>
  | Readonly<{ state: "ambiguous" }>;

function validEgressId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 255;
}

function isDefinitiveStartFailure(error: unknown): boolean {
  const retryableOrAmbiguousStatus = [408, 409, 421, 423, 424, 425, 429, 499];
  return error instanceof ServerError
    && Number.isInteger(error.status)
    && error.status >= 400
    && error.status < 500
    && !retryableOrAmbiguousStatus.includes(error.status);
}

function requestedPaths(info: Awaited<ReturnType<EgressClientBoundary["listEgress"]>>[number]): string[] {
  const paths = new Set(info.fileResults.map(({ filename }) => filename).filter(Boolean));
  if (info.request.case === "roomComposite") {
    for (const output of info.request.value.fileOutputs) paths.add(output.filepath);
    if (info.request.value.output.case === "file") paths.add(info.request.value.output.value.filepath);
  }
  if (info.request.case === "egress") {
    for (const output of info.request.value.outputs) {
      if (output.config.case === "file") paths.add(output.config.value.filepath);
    }
  }
  return [...paths].filter(Boolean);
}

export function createEgressProvider(
  client: EgressClientBoundary,
  storage: PrivateStorageConfig,
) {
  return {
    async startRecording(input: Readonly<{ roomName: string; storageKey: string }>) {
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: input.storageKey,
        output: {
          case: "s3",
          value: new S3Upload({
            accessKey: storage.accessKey,
            secret: storage.secret,
            bucket: storage.bucket,
            endpoint: storage.endpoint ?? "",
            region: storage.region ?? "",
            forcePathStyle: storage.forcePathStyle ?? false,
          }),
        },
      });
      try {
        const egress = await client.startRoomCompositeEgress(input.roomName, output, {
          encodingOptions: EncodingOptionsPreset.H264_720P_30,
        });
        if (!validEgressId(egress.egressId)) return { state: "ambiguous" } as const;
        return { state: "started", egressId: egress.egressId.trim() } as const;
      } catch (error) {
        return isDefinitiveStartFailure(error)
          ? { state: "definitive-failure" } as const
          : { state: "ambiguous" } as const;
      }
    },
    async listActiveRecordings(roomName: string) {
      const active = await client.listEgress({ roomName, active: true });
      const recordings: { egressId: string | null; storageKey: string | null }[] = [];
      for (const info of active) {
        const egressId = validEgressId(info.egressId) ? info.egressId.trim() : null;
        const paths = requestedPaths(info);
        if (paths.length === 0) recordings.push({ egressId, storageKey: null });
        for (const storageKey of paths) recordings.push({ egressId, storageKey });
      }
      return recordings;
    },
  } as const;
}

export function createConfiguredEgressProvider(input: Readonly<{
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
  storage: PrivateStorageConfig;
}>) {
  return createEgressProvider(
    new EgressClient(input.apiUrl, input.apiKey, input.apiSecret),
    input.storage,
  );
}

export async function startRoomRecording(request: Readonly<{
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
  storage: PrivateStorageConfig;
  roomName: string;
  storageKey: string;
}>): Promise<RecordingStartResult> {
  return createConfiguredEgressProvider(request).startRecording(request);
}
