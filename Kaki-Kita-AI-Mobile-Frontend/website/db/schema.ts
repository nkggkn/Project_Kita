import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  name: text("name").notNull(), type: text("type").notNull(),
  location: text("location").notNull(), area: real("area"),
  notes: text("notes").notNull(), checklist: text("checklist").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("rooms_owner_idx").on(t.owner)]);

export const media = sqliteTable("media", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  roomId: text("room_id").notNull().references(() => rooms.id),
  name: text("name").notNull(), type: text("type").notNull(),
  size: integer("size").notNull(), key: text("key").notNull(),
  reportKey: text("report_key"), analyzedAt: text("analyzed_at"),
  createdAt: text("created_at").notNull(),
}, t => [index("media_room_idx").on(t.roomId, t.owner)]);

export const settings = sqliteTable("settings", {
  owner: text("owner").primaryKey(), apiUrl: text("api_url").notNull(),
});

export const safetyReviews = sqliteTable("safety_reviews", {
  owner: text("owner").notNull(), scope: text("scope").notNull(),
  location: text("location").notNull(), checks: text("checks").notNull(),
  updatedAt: text("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.scope] })]);

export const removalChecklists = sqliteTable("removal_checklists", {
  mediaId: text("media_id").primaryKey().references(() => media.id, { onDelete: "cascade" }),
  owner: text("owner").notNull(), items: text("items").notNull(),
  sampleIndex: integer("sample_index").notNull(), seconds: real("seconds"),
  analyzedAt: text("analyzed_at").notNull(), updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
}, t => [index("removal_checklists_owner_idx").on(t.owner)]);

export const publicUsage = sqliteTable("public_usage", {
  key: text("key").primaryKey(), used: integer("used").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, t => [index("public_usage_expiry_idx").on(t.expiresAt)]);

export const cleanPreviews = sqliteTable("clean_previews", {
  mediaId: text("media_id").primaryKey().references(() => media.id, { onDelete: "cascade" }),
  owner: text("owner").notNull(), status: text("status").notNull(),
  jobId: text("job_id"), previewKey: text("preview_key"),
  startedAt: text("started_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const translations = sqliteTable("translations", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  locale: text("locale").notNull(), translated: text("translated").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [index("translations_expiry_idx").on(t.createdAt)]);
