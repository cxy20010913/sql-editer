export type SqlDialect =
  | "postgresql"
  | "mysql"
  | "sqlserver"
  | "sqlite"
  | "oracle"
  | "generic";

export interface FieldSpec {
  name: string;
  comment: string;
}

export interface EventSpec {
  eventName: string;
  attributes: FieldSpec[];
}

export interface TableSpec {
  baseTable: string;
  fields: FieldSpec[];
  sourceKind?: "manual" | "preset" | "event";
  eventTableName?: string;
  events?: EventSpec[];
  resultMode: "goal" | "structured";
  userGoal?: string;
  resultSpec?: {
    groupByFields: string[];
    orderBy: string;
    aggregateFields: string[];
  };
}

export interface GeneratePayload {
  dialect: SqlDialect;
  tables: TableSpec[];
  targetPlatform?: string;
  apiProfileId?: string;
  temperature?: number;
}
