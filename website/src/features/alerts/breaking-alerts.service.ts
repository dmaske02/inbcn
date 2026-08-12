import { orderAlerts } from "./breaking-alerts.model.ts";
import { mapPublicAlertRow } from "./breaking-alerts.repository-model.ts";


export async function getPublicBreakingAlerts(locale: string) {
  const { getActiveBreakingAlerts } = await import("./breaking-alerts.repository");
  try {
    const rows = await getActiveBreakingAlerts(locale);
    return orderAlerts(rows.map(mapPublicAlertRow));
  } catch (error) {
    const code = error && typeof error === "object" ? Reflect.get(error, "code") : null;
    if (code !== "PGRST205" && code !== "42P01") {
      const message = error instanceof Error ? error.message : error && typeof error === "object" ? Reflect.get(error, "message") : null;
      console.error(JSON.stringify({ event: "public_alerts_unavailable", code, reason: typeof message === "string" ? message : "Unknown repository error" }));
    }
    return [];
  }
}

