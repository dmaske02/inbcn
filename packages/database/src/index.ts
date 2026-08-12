import type { Database } from "./database.types";

export type { Database, Json } from "./database.types";
export type TableName = keyof Database["public"]["Tables"];
export type TableRow<Name extends TableName> = Database["public"]["Tables"][Name]["Row"];
export type EnumName = keyof Database["public"]["Enums"];
export type DatabaseEnum<Name extends EnumName> = Database["public"]["Enums"][Name];
