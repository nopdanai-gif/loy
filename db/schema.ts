import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const events = sqliteTable('events', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(), place: text('place').notNull(),
  accepting: integer('accepting').notNull().default(1), moderation: integer('moderation').notNull().default(0),
  paused: integer('paused').notNull().default(0), interval_ms: integer('interval_ms').notNull().default(2200), float_ms: integer('float_ms').notNull().default(24000), scene_json: text('scene_json'), led_json: text('led_json'), ceremony_json: text('ceremony_json'), created_at: integer('created_at').notNull(),
}, t => [index('events_owner').on(t.owner)]);
export const wishes = sqliteTable('wishes', {
  id: text('id').primaryKey(), event_id: text('event_id').notNull().references(()=>events.id), device: text('device').notNull(),
  name: text('name').notNull(), message: text('message').notNull(), style: integer('style').notNull(), design_json: text('design_json'), status: text('status').notNull(), created_at: integer('created_at').notNull(),
  photo_id:text('photo_id'),voice_id:text('voice_id'),voice_duration_ms:integer('voice_duration_ms'),
}, t=>[index('wishes_event_status').on(t.event_id,t.status,t.created_at)]);
export const media=sqliteTable('media',{
 id:text('id').primaryKey(),event_id:text('event_id').notNull().references(()=>events.id),submission_id:text('submission_id').notNull(),device:text('device').notNull(),kind:text('kind').notNull(),mime:text('mime').notNull(),byte_size:integer('byte_size').notNull(),duration_ms:integer('duration_ms'),digest:text('digest').notNull(),read_token:text('read_token').notNull(),ready:integer('ready').notNull().default(0),created_at:integer('created_at').notNull(),
},t=>[index('media_event_created').on(t.event_id,t.created_at),index('media_submission').on(t.submission_id)]);
export const feed = sqliteTable('feed', {
  seq: integer('seq').primaryKey({autoIncrement:true}), event_id: text('event_id').notNull().references(()=>events.id),
  wish_id: text('wish_id').notNull().references(()=>wishes.id), action: text('action').notNull(), created_at: integer('created_at').notNull(),
},t=>[index('feed_event_cursor').on(t.event_id,t.seq),index('feed_event_action_cursor').on(t.event_id,t.action,t.seq),uniqueIndex('feed_wish_action').on(t.wish_id,t.action)]);
export const rateLimits = sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
