type ProviderClient = Readonly<{
  removeParticipant(room: string, identity: string, options: Readonly<{ revokeTokenTs: bigint }>): Promise<void>;
  deleteRoom(room: string): Promise<void>;
}>;

function absent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: unknown }).status === 404;
}

export function createLiveKitTerminationProvider(client: ProviderClient, now = () => Math.floor(Date.now() / 1_000)) {
  return async function cleanup(input: Readonly<{ roomName: string; profileId: string }>): Promise<void> {
    let failure: unknown;
    try {
      await client.removeParticipant(input.roomName, input.profileId, { revokeTokenTs: BigInt(now()) });
    } catch (error) {
      if (!absent(error)) failure = error;
    }
    try {
      await client.deleteRoom(input.roomName);
    } catch (error) {
      if (!absent(error) && !failure) failure = error;
    }
    if (failure) throw failure;
  };
}
