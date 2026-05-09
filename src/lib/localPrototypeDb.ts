import { mkdirSync } from "node:fs";
import { z } from "zod";
import { ARTIFACTS_DIR, PROTOTYPE_DB_PATH } from "@/src/lib/paths";
import { targetConfigSchema, type TargetConfig } from "@/src/lib/config";

type PrototypeDb = InstanceType<(typeof import("bun:sqlite"))["Database"]>;

const tableSchema = z.enum(["config_snapshots", "run_metadata", "audit_events"]);

const configSnapshotRecordSchema = z.object({
  table: z.literal("config_snapshots"),
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  config: targetConfigSchema
});

const runMetadataRecordSchema = z.object({
  table: z.literal("run_metadata"),
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  configId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: z.enum(["queued", "running", "passed", "failed", "cancelled"])
});

const auditEventRecordSchema = z.object({
  table: z.literal("audit_events"),
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  action: z.string().trim().min(1),
  targetId: z.string().trim().min(1),
  message: z.string().trim().min(1)
});

export const localPrototypeRecordSchema = z.discriminatedUnion("table", [
  configSnapshotRecordSchema,
  runMetadataRecordSchema,
  auditEventRecordSchema
]);

const rowSchema = z.object({
  table_name: tableSchema,
  payload: z.string()
});

export type LocalPrototypeTable = z.infer<typeof tableSchema>;
export type LocalPrototypeRecord = z.infer<typeof localPrototypeRecordSchema>;
export type ConfigSnapshotRecord = z.infer<typeof configSnapshotRecordSchema>;
export type RunMetadataRecord = z.infer<typeof runMetadataRecordSchema>;
export type AuditEventRecord = z.infer<typeof auditEventRecordSchema>;
export type LocalPrototypeSnapshot = {
  recentConfigs: ConfigSnapshotRecord[];
  recentRuns: RunMetadataRecord[];
  recentEvents: AuditEventRecord[];
};

function createRecordId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function openDb(): Promise<PrototypeDb> {
  const { Database } = await import("bun:sqlite");
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const db = new Database(PROTOTYPE_DB_PATH);
  db.run(`
    create table if not exists prototype_records (
      id text primary key,
      table_name text not null,
      created_at text not null,
      payload text not null
    )
  `);
  return db;
}

export async function appendLocalPrototypeRecord(record: LocalPrototypeRecord): Promise<void> {
  const parsed = localPrototypeRecordSchema.parse(record);
  const db = await openDb();
  try {
    db.query("insert or replace into prototype_records (id, table_name, created_at, payload) values ($id, $tableName, $createdAt, $payload)").run({
      $id: parsed.id,
      $tableName: parsed.table,
      $createdAt: parsed.createdAt,
      $payload: JSON.stringify(parsed)
    });
  } finally {
    db.close();
  }
}

export async function readLocalPrototypeRecords(): Promise<LocalPrototypeRecord[]> {
  const db = await openDb();
  try {
    const rows = db.query("select table_name, payload from prototype_records order by created_at asc").all();
    return rows.map((row) => {
      const parsedRow = rowSchema.parse(row);
      const payload: unknown = JSON.parse(parsedRow.payload);
      return localPrototypeRecordSchema.parse(payload);
    });
  } finally {
    db.close();
  }
}

export async function readLocalPrototypeRecordsByTable(table: LocalPrototypeTable): Promise<LocalPrototypeRecord[]> {
  const records = await readLocalPrototypeRecords();
  return records.filter((record) => record.table === table);
}

function sortNewestFirst<T extends { createdAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function readRecentConfigSnapshots(limit = 4): Promise<ConfigSnapshotRecord[]> {
  const records = await readLocalPrototypeRecordsByTable("config_snapshots");
  return sortNewestFirst(records)
    .slice(0, limit)
    .map((record) => configSnapshotRecordSchema.parse(record));
}

export async function readRecentRunMetadata(limit = 8): Promise<RunMetadataRecord[]> {
  const records = await readLocalPrototypeRecordsByTable("run_metadata");
  return sortNewestFirst(records)
    .slice(0, limit)
    .map((record) => runMetadataRecordSchema.parse(record));
}

export async function readRecentAuditEvents(limit = 8): Promise<AuditEventRecord[]> {
  const records = await readLocalPrototypeRecordsByTable("audit_events");
  return sortNewestFirst(records)
    .slice(0, limit)
    .map((record) => auditEventRecordSchema.parse(record));
}

export async function readLocalPrototypeSnapshot(limitRuns = 8, limitConfigs = 4, limitEvents = 8): Promise<LocalPrototypeSnapshot> {
  const [recentConfigs, recentRuns, recentEvents] = await Promise.all([
    readRecentConfigSnapshots(limitConfigs),
    readRecentRunMetadata(limitRuns),
    readRecentAuditEvents(limitEvents)
  ]);

  return {
    recentConfigs,
    recentRuns,
    recentEvents
  };
}

export async function persistConfigSnapshot(config: TargetConfig): Promise<ConfigSnapshotRecord> {
  const record: ConfigSnapshotRecord = {
    table: "config_snapshots",
    id: createRecordId("cfg"),
    createdAt: new Date().toISOString(),
    config
  };
  await appendLocalPrototypeRecord(record);
  return record;
}

export async function persistRunMetadata(input: Omit<RunMetadataRecord, "table" | "createdAt">): Promise<RunMetadataRecord> {
  const record: RunMetadataRecord = {
    ...input,
    table: "run_metadata",
    id: input.id,
    createdAt: new Date().toISOString()
  };
  await appendLocalPrototypeRecord(record);
  return record;
}

export async function persistAuditEvent(input: Omit<AuditEventRecord, "table" | "id" | "createdAt">): Promise<AuditEventRecord> {
  const record: AuditEventRecord = {
    table: "audit_events",
    id: createRecordId("evt"),
    createdAt: new Date().toISOString(),
    ...input
  };
  await appendLocalPrototypeRecord(record);
  return record;
}
