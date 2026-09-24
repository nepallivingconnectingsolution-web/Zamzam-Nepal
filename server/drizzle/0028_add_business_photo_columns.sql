-- Business image uploads: hotels/restaurants/groceryStores already have a
-- photos jsonb column; buses, room_types and vehicles get one too, so every
-- partner role can attach a gallery. Hand-written like 0022-0027 (drizzle
-- snapshots stopped at 0021 — see 0026's note). Existing busPhoto/photoRef
-- single-photo fields are untouched; reads fall back to them when photos is
-- empty (photos[0] ?? busPhoto / photoRef).
ALTER TABLE "buses" ADD COLUMN IF NOT EXISTS "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;
