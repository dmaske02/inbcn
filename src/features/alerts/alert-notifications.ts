export type AlertNotificationEvent = Readonly<{
  alertId: string;
  action: "created" | "updated" | "activated" | "deactivated" | "archived" | "deleted" | "duplicated";
  occurredAt: string;
}>;

export type AlertNotificationChannel = Readonly<{
  deliver(event: AlertNotificationEvent): Promise<void>;
}>;

/** Future push, email, and SMS adapters can be registered here. */
export async function dispatchAlertNotification(
  event: AlertNotificationEvent,
  channels: readonly AlertNotificationChannel[] = [],
): Promise<void> {
  await Promise.all(channels.map((channel) => channel.deliver(event)));
}
