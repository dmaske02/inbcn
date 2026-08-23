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
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 255
    && /^[A-Za-z0-9_-]+$/u.test(value);
}

function isDefinitiveStartFailure(error: unknown): boolean {
  const retryableOrAmbiguousStatus = [408, 409, 421, 423, 424, 425, 429, 499];
  return error instanceof ServerError
    && Number.isInteger(error.status)
    && error.status >= 400
    && error.status < 500
    && !retryableOrAmbiguousStatus.includes(error.status);
}

function validStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function requestedFile(
  info: Awaited<ReturnType<EgressClientBoundary["listEgress"]>>[number],
  roomName: string,
): string | null {
  if (info.roomName !== roomName) return null;
  if (info.request.case === "egress") {
    const request = info.request.value;
    if (request.roomName !== roomName || request.outputs.length !== 1) return null;
    const output = request.outputs[0]?.config;
    return output?.case === "file" && output.value.fileType === EncodedFileType.MP4
      && output.value.filepath.length >= 1 && output.value.filepath.length <= 1_024
      ? output.value.filepath
      : null;
  }
  if (info.request.case === "roomComposite") {
    const request = info.request.value;
    if (request.roomName !== roomName || request.streamOutputs.length > 0
      || request.segmentOutputs.length > 0 || request.imageOutputs.length > 0
      || (request.output.case !== undefined && request.output.case !== "file")) return null;
    const files = [...request.fileOutputs];
    if (request.output.case === "file") files.push(request.output.value);
    if (files.length === 0 || files.some((file) => file.fileType !== EncodedFileType.MP4
      || file.filepath.length < 1 || file.filepath.length > 1_024)) return null;
    const paths = new Set(files.map(({ filepath }) => filepath));
    return paths.size === 1 ? [...paths][0] ?? null : null;
  }
  return null;
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
        return { state: "started", egressId: egress.egressId } as const;
      } catch (error) {
        return isDefinitiveStartFailure(error)
          ? { state: "definitive-failure" } as const
          : { state: "ambiguous" } as const;
      }
    },
    async listRoomRecordings(roomName: string) {
      const recordings = await client.listEgress({ roomName });
      return recordings.map((info) => {
        const storageKey = requestedFile(info, roomName);
        if (storageKey === null) return { egressId: null, storageKey: null, status: null };
        return {
          egressId: validEgressId(info.egressId) ? info.egressId : null,
          storageKey,
          status: validStatus(info.status) ? info.status : null,
        };
      });
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
