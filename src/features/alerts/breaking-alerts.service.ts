import type { AlertFormValues } from "./breaking-alerts.model.ts";
import { alertFormSchema, canDeleteAlerts, canManageAlerts, orderAlerts } from "./breaking-alerts.model.ts";
import { mapPublicAlertRow } from "./breaking-alerts.repository-model.ts";

type Principal = Readonly<{ id: string; role: string }>;
type Row = Readonly<Record<string, unknown> & { id: string; title: string; status: string; is_active: boolean }>;
type Repository = Readonly<{
  getById(id: string): Promise<Row | null>;
  insert(input: Record<string, unknown>): Promise<unknown>;
  update(id: string, input: Record<string, unknown>): Promise<unknown>;
  remove(id: string): Promise<void>;
  targetMatchesLanguage?(input: Readonly<{ scope: string; languageId: string; categoryId: string | null; storyId: string | null }>): Promise<boolean>;
}>;

export class AlertManagementError extends Error {
  readonly code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION";
  constructor(code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION", message: string) { super(message); this.code = code; this.name = "AlertManagementError"; }
}

function assertManager(principal: Principal) {
  if (!canManageAlerts(principal.role)) throw new AlertManagementError("FORBIDDEN", "You cannot manage alerts.");
}

function persistence(values: AlertFormValues) {
  return { title: values.title, message: values.message, type: values.type, placement: values.placement,
    status: values.status, is_active: values.isActive, priority: values.priority, target_scope: values.targetScope,
    language_id: values.languageId, category_id: values.targetScope === "category" ? values.categoryId : null,
    story_id: values.targetScope === "story" ? values.storyId : null, background_color: values.backgroundColor,
    text_color: values.textColor, dismissible: values.dismissible, start_at: new Date(values.startAt).toISOString(),
    end_at: values.endAt ? new Date(values.endAt).toISOString() : null };
}

export function createAlertService(repository: Repository) {
  return {
    async create(principal: Principal, input: unknown) {
      assertManager(principal);
      const parsed = alertFormSchema.safeParse(input);
      if (!parsed.success) throw new AlertManagementError("VALIDATION", "Check the alert fields and try again.");
      if (repository.targetMatchesLanguage && !await repository.targetMatchesLanguage({ scope: parsed.data.targetScope, languageId: parsed.data.languageId, categoryId: parsed.data.categoryId || null, storyId: parsed.data.storyId || null })) throw new AlertManagementError("VALIDATION", "The selected target must belong to the selected language.");
      return repository.insert({ ...persistence(parsed.data), status: "draft", is_active: false, created_by: principal.id });
    },
    async save(principal: Principal, id: string, input: unknown) {
      assertManager(principal);
      if (!await repository.getById(id)) throw new AlertManagementError("NOT_FOUND", "Alert not found.");
      const parsed = alertFormSchema.safeParse(input);
      if (!parsed.success) throw new AlertManagementError("VALIDATION", "Check the alert fields and try again.");
      if (repository.targetMatchesLanguage && !await repository.targetMatchesLanguage({ scope: parsed.data.targetScope, languageId: parsed.data.languageId, categoryId: parsed.data.categoryId || null, storyId: parsed.data.storyId || null })) throw new AlertManagementError("VALIDATION", "The selected target must belong to the selected language.");
      return repository.update(id, persistence(parsed.data));
    },
    async command(principal: Principal, id: string, command: "activate" | "deactivate" | "archive" | "delete" | "duplicate") {
      assertManager(principal);
      const alert = await repository.getById(id);
      if (!alert) throw new AlertManagementError("NOT_FOUND", "Alert not found.");
      if (command === "delete") {
        if (!canDeleteAlerts(principal.role)) throw new AlertManagementError("FORBIDDEN", "Only an administrator can permanently delete alerts.");
        return repository.remove(id);
      }
      if (command === "duplicate") return repository.insert({ ...alert, id: undefined, title: `${alert.title} (Copy)`, status: "draft", is_active: false, created_by: principal.id, created_at: undefined, updated_at: undefined });
      const patches = { activate: { status: "active", is_active: true }, deactivate: { is_active: false }, archive: { status: "archived", is_active: false } } as const;
      return repository.update(id, patches[command]);
    },
  };
}

async function productionService() {
  const repository = await import("./breaking-alerts.repository");
  return createAlertService({ getById: repository.getBreakingAlertById, insert: repository.insertBreakingAlert, update: repository.updateBreakingAlert, remove: repository.deleteBreakingAlert, targetMatchesLanguage: repository.alertTargetMatchesLanguage });
}
export async function createBreakingAlert(principal: Principal, input: unknown) {
  const result = await (await productionService()).create(principal, input);
  const { dispatchAlertNotification } = await import("./alert-notifications");
  await dispatchAlertNotification({ alertId: String((result as { id: string }).id), action: "created", occurredAt: new Date().toISOString() });
  return result;
}
export async function saveBreakingAlert(principal: Principal, id: string, input: unknown) {
  const result = await (await productionService()).save(principal, id, input);
  const { dispatchAlertNotification } = await import("./alert-notifications");
  await dispatchAlertNotification({ alertId: id, action: "updated", occurredAt: new Date().toISOString() });
  return result;
}
export async function runBreakingAlertCommand(principal: Principal, id: string, command: "activate" | "deactivate" | "archive" | "delete" | "duplicate") {
  const result = await (await productionService()).command(principal, id, command);
  const { dispatchAlertNotification } = await import("./alert-notifications");
  const action = command === "activate" ? "activated" : command === "deactivate" ? "deactivated" : command === "archive" ? "archived" : command === "delete" ? "deleted" : "duplicated";
  await dispatchAlertNotification({ alertId: id, action, occurredAt: new Date().toISOString() });
  return result;
}

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

export async function getAlertListView(params: Readonly<Record<string,string|undefined>>) {
  const repository = await import("./breaking-alerts.repository");
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1); const pageSize = 20;
  const status = ["draft","active","archived"].includes(params.status ?? "") ? params.status : undefined;
  const type = ["breaking","alert","emergency"].includes(params.type ?? "") ? params.type : undefined;
  const sort: "updated" | "priority" | "start_asc" = params.sort === "priority" || params.sort === "start_asc" ? params.sort : "updated";
  const [result, references, counts] = await Promise.all([repository.getBreakingAlertPage({ page, pageSize, search: params.search?.trim() || undefined, status, type, languageId: params.language || undefined, sort }), repository.getBreakingAlertReferences(), repository.getAlertStatusCounts()]);
  return { ...result, references, counts, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total/pageSize)), filters: { search: params.search ?? "", status: status ?? "", type: type ?? "", language: params.language ?? "", sort } };
}
export async function getAlertEditorView(id?: string) {
  const repository = await import("./breaking-alerts.repository");
  const [alert, references] = await Promise.all([id ? repository.getBreakingAlertById(id) : Promise.resolve(null), repository.getBreakingAlertReferences()]);
  if (id && !alert) throw new AlertManagementError("NOT_FOUND", "Alert not found.");
  return { alert, references };
}
