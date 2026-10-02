import { boolean, integer, jsonb, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const tickets = pgTable('tickets', {
  ticketHash: text('ticket_hash').primaryKey(),
  holderName: text('holder_name').notNull().default(''),
  status: text().notNull().default('unused'), // 'unused' | 'used'
  scannedAt: text('scanned_at').notNull().default(''),
})

export const teams = pgTable('teams', {
  teamId: text('team_id').primaryKey(),
  teamName: text('team_name').notNull(),
})

export const people = pgTable('users', {
  userId: text('user_id').primaryKey(),
  fullName: text('full_name').notNull(),
  role: text().notNull(), // 'Player' | 'Artist' | 'Staff'
  teamId: text('team_id').references(() => teams.teamId, { onDelete: 'set null' }),
  // 128-dim face embedding, stored as a JSON number array
  faceVector: jsonb('face_vector').$type<number[]>().notNull(),
  photo: text(), // small JPEG thumbnail data URL for visual confirmation at the gate
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const performances = pgTable('performances', {
  perfId: text('perf_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => people.userId, { onDelete: 'cascade' }),
  stageName: text('stage_name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
})

// Audit trail of every offline check performed by gate devices, uploaded on sync-up
export const scanEvents = pgTable('scan_events', {
  id: serial().primaryKey(),
  clientId: text('client_id').notNull().unique(),
  deviceId: text('device_id').notNull(),
  kind: text().notNull(), // 'ticket' | 'team' | 'face'
  input: text().notNull(),
  outcome: text().notNull(),
  detail: text().notNull().default(''),
  scannedAt: text('scanned_at').notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
})

// Event photos shown on the guest page. The image bytes live in Netlify Blobs under `blob_key`.
export const eventPhotos = pgTable('event_photos', {
  photoId: text('photo_id').primaryKey(),
  caption: text().notNull().default(''),
  blobKey: text('blob_key').notNull(),
  contentType: text('content_type').notNull().default('image/jpeg'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// One like and/or star rating per anonymous guest browser per photo
export const photoReactions = pgTable(
  'photo_reactions',
  {
    id: serial().primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => eventPhotos.photoId, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    liked: boolean().notNull().default(false),
    stars: integer(), // 1–5, null when not rated
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [unique('photo_reactions_photo_visitor').on(t.photoId, t.visitorId)],
)
