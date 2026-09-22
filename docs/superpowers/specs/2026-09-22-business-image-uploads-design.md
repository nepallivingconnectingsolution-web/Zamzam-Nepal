# Business image uploads — design

**Status:** approved, not yet implemented
**Date:** 2026-09-22

## Problem

Every partner-facing business entity in the platform (`hotels`, `restaurants`,
`groceryStores`, `buses`, `vehicles` — the last shared by the `driver` and
`freight` roles) either has a `photos`/`photoRef` field with no way to fill
it, or no photo field at all:

| Entity | DB field today | Upload endpoint today |
|---|---|---|
| `hotels` | `photos: jsonb string[]` | none — DTO accepts an array of strings, but nothing produces a URL |
| `roomTypes` | *(none)* | none |
| `restaurants` | `photos: jsonb string[]` | none |
| `groceryStores` | `photos: jsonb string[]` | none |
| `buses` | `busPhoto: text` (single) | not even in `RegisterBusDto` — unreachable |
| `vehicles` (driver + freight) | `photoRef: text` (single) | DTO accepts a plain string, no upload |

Business owners logging into their panels (hotel, bus, freight, driver,
restaurant, grocery) have no way to attach real photos of their property,
rooms, buses (incl. interior), or vehicles. This spec adds that capability
uniformly across all six partner roles, reusing the moderation and
validation infrastructure already built for driver/partner KYC documents.

## Goals

- Every business-owning partner role can upload and delete photos for the
  entities they own, through their existing partner panel.
- Photos are served through a CDN with automatic format/quality
  optimization (Cloudinary), not local disk — this must survive multiple
  server replicas/containers in production.
- Reuse existing moderation (`ModerationService` / Rekognition) and file
  validation (magic-byte sniffing) rather than re-implementing either.
- No breaking changes to anything currently reading `busPhoto` or
  `photoRef`.

## Non-goals

- Photo captions/ordering/tagging (e.g. labelling a specific bus photo as
  "interior"). Out of scope — a flat gallery per entity, first photo is the
  cover, is enough for this build.
- Image editing/cropping in the browser.
- Migrating `hotels`/`restaurants`/`groceryStores` off `photos: jsonb` — that
  shape is already correct, it just needs an upload endpoint.
- Dropping the legacy `busPhoto`/`photoRef` columns — deferred to a later
  cleanup once the new `photos` array is proven in production.

## Architecture

### Shared building blocks (new)

**`server/src/common/uploads/validate-upload.ts`** — relocated from
`server/src/modules/driver-onboarding/files/file-validation.ts` (used by 6
domains now, not just driver onboarding). Same function, same behavior:
size cap, magic-byte sniff, declared-mimetype-must-match-sniffed-type,
`imagesOnly` option. The one existing import
(`driver-onboarding/files/files.controller.ts` and wherever else references
it) is updated to the new path. No behavior change.

**`server/src/common/cloudinary/cloudinary.module.ts` /
`cloudinary.service.ts`** (new) — thin wrapper around the `cloudinary` npm
SDK:

```ts
class CloudinaryService {
  isConfigured(): boolean;
  uploadImage(buffer: Buffer, folder: string): Promise<{ url: string; publicId: string }>;
  deleteImage(publicId: string): Promise<void>; // best-effort, never throws
}
```

- Configured via a single `CLOUDINARY_URL` env var
  (`cloudinary://<api_key>:<api_secret>@<cloud_name>`), which the SDK parses
  natively from `process.env.CLOUDINARY_URL` — no custom parsing needed.
- `uploadImage` streams the buffer to `cloudinary.uploader.upload_stream`
  with `resource_type: 'image'`, `folder: zamzam/<folder>`, and delivery
  transformation `f_auto,q_auto` baked into the returned URL so every image
  is served pre-optimized (WebP/AVIF where supported) without per-request
  transformation cost.
- `isConfigured()` false when `CLOUDINARY_URL` is unset. Mirrors the
  existing `AWS_REGION` pattern in `ModerationService`: `main.ts` logs a
  loud `console.warn` on boot if unset (never crashes dev/test), and
  `uploadImage` throws a friendly 503-style `apiError` if called while
  unconfigured, so an unconfigured deployment fails the upload request
  cleanly instead of silently no-op'ing.

**`server/src/common/uploads/business-image-upload.service.ts`** (new) — the
one piece of logic every domain service calls:

```ts
class BusinessImageUploadService {
  async upload(file: { buffer, mimetype, size, originalname }, folder: string): Promise<string> // returns Cloudinary URL
}
```

Internally: `validateUpload(file, { imagesOnly: true })` → if
`file.mimetype.startsWith('image/')` run `ModerationService.checkImage`
(fail closed on error, reject on `!allowed`, same as
`driver-documents.service.ts`) → `CloudinaryService.uploadImage`. Each
domain service (hotel, buses, vehicles, restaurant, grocery) calls this,
then does its own DB update (array push, ownership check, cap check,
`updatedAt`) — keeping business logic where it already lives, per-domain,
rather than centralizing it into one generic controller. This matches how
`driver-documents` and `partner-documents` are already two separate
services sharing no code but the same shape.

### Schema (one Drizzle migration)

```ts
// buses
photos: jsonb('photos').$type<string[]>().notNull().default([]),

// roomTypes
photos: jsonb('photos').$type<string[]>().notNull().default([]),

// vehicles
photos: jsonb('photos').$type<string[]>().notNull().default([]),
```

`hotels`, `restaurants`, `groceryStores` already have `photos` — untouched.

`busPhoto` and `photoRef` columns are **not** removed or backfilled by the
migration. Each domain's read path (`toDto`/serializer) computes the cover
photo as `photos[0] ?? busPhoto` (buses) or `photos[0] ?? photoRef`
(vehicles), so existing single-photo data keeps showing up exactly where it
does today, and nothing currently rendering `busPhoto`/`photoRef` needs to
change. New uploads only ever write to `photos`.

Cap: **10 photos per entity**, enforced in each domain service before
calling `BusinessImageUploadService.upload`
(`if (existing.photos.length + files.length > 10) apiError(400, 'You can
have at most 10 photos — delete some before adding more.')`). The check
runs against the full batch before any file in the request is uploaded, so
a request that would exceed the cap is rejected atomically — never a
partial upload.

### API surface

One `POST .../:id/photos` (multipart, field name `files`, up to 10 files
per request — `FilesInterceptor('files', 10, { storage: memoryStorage(),
limits: { fileSize: 5 * 1024 * 1024 } })`) and one `DELETE
.../:id/photos/:publicId` per existing partner controller. Each returns the
entity's updated `photos` array.

| Controller | Route prefix | Role(s) |
|---|---|---|
| `PartnerHotelsController` | `hotel/hotels/:id/photos` | `hotel` |
| `PartnerHotelsController` | `hotel/hotels/:id/room-types/:roomTypeId/photos` | `hotel` |
| `OperatorBusesController` | `operator/buses/:id/photos` | `bus_operator` |
| `VehiclesController` | `vehicles/:id/photos` | `driver`, `freight` |
| `PartnerRestaurantsController` | `restaurant/restaurants/:id/photos` | `restaurant` |
| `PartnerGroceriesController` | `grocery/stores/:id/photos` | `grocery` |

Ownership is checked exactly the way each controller's existing
update/delete methods already check it (e.g. `updateHotel` loads the row
and 403s if `partnerId !== user.id`) — the photo endpoints reuse that same
lookup, not a new authorization path.

`publicId` in the delete route is the Cloudinary public ID (URL-safe,
returned in the upload response alongside the URL) — not an array index, so
deletes are unambiguous even if two requests race.

Rate limiting: the new endpoints get the same `@nestjs/throttler` guard
already used elsewhere (e.g. auth endpoints), capped at a level generous
enough for real usage (e.g. 20 requests/5min per partner) but enough to
stop a scripted loop from burning through Cloudinary quota and Rekognition
calls.

### Data flow

1. Partner selects photos in their panel → client validates type/size
   client-side (same as `PartnerDocumentsPage.handleFile`) → `POST
   .../:id/photos` as `multipart/form-data`.
2. Controller's `FilesInterceptor` buffers files in memory, rejects
   non-image mimetypes at the multer layer.
3. Domain service: ownership check → cap check → for each file,
   `BusinessImageUploadService.upload()` (validate → moderate → Cloudinary
   upload) → append resulting URLs to `photos` → one DB update with the
   full new array → return updated entity.
4. Client replaces its cached `photos` array with the response, no refetch
   needed.
5. Delete: domain service loads entity, ownership check, removes the URL
   matching `publicId` from `photos`, DB update, then best-effort
   `CloudinaryService.deleteImage(publicId)` (failure doesn't block the
   response — matches `deleteUploadedDocumentFile`'s "stale file isn't
   worth failing the request over" philosophy, just for Cloudinary instead
   of disk).

### Entity deletion cleanup

`deleteHotel`, `deleteBus`, `vehicles.remove`, etc. already cascade-delete
DB rows. They gain one addition: best-effort
`Promise.allSettled(photos.map(url => cloudinary.deleteImage(publicIdFromUrl(url))))`
before/after the DB delete, so removed businesses don't leave orphaned
(and billed) Cloudinary assets behind. Never blocks or fails the delete
request.

### Client

**`client/src/components/shared/photo-uploader.tsx`** (new, shared) —
thumbnail grid + "Add photos" (multi-file `<input type=file multiple>`) +
per-thumbnail delete (×), upload-in-progress state per file, using the
existing `api.upload(path, formData)` helper and the same client-side
pre-check pattern (`MAX_FILE_SIZE_BYTES`, allowed mimetypes) already
written in `PartnerDocumentsPage.tsx`. Props: `photos: string[]`,
`onUpload(files: File[])`, `onDelete(publicId: string)`, `max?: number`
(default 10).

Wired into:
- `HotelPartnerManager.tsx` — hotel card (property photos) and
  `RoomTypesPanel` (per-room photos).
- `OperatorBusManager.tsx` — bus card (fleet + interior, one gallery).
- Freight/driver vehicle management UI (wherever `RegisterVehicleDto`/
  `UpdateVehicleDto` forms currently live, e.g. `VehicleStep.tsx` and the
  freight equivalent) — vehicle photos.
- `PartnerRestaurantsManager`/equivalent — restaurant photos.
- `PartnerGroceriesManager`/equivalent — store photos.

New entries in `client/src/api/client.ts`'s `endpoints` registry, e.g.:

```ts
hotels: { partner: { photos: {
  upload: (id: string) => `/hotel/hotels/${id}/photos`,
  delete: (id: string, publicId: string) => `/hotel/hotels/${id}/photos/${publicId}`,
} } },
```
(one such block per domain, following the existing registry shape).

### Error handling

- Oversized file / wrong type → 400 `INVALID_FILE`, same shape as existing
  upload validation errors (`apiError`), surfaced via the existing
  `ApiError` → `toast.error` pattern on the client.
- Moderation rejection → 422, same as `driver-documents.service.ts`.
- Cap exceeded (>10 photos) → 400 with a clear message.
- Cloudinary unconfigured → 503-style `apiError`, so a misconfigured
  deployment fails loudly on first real upload attempt rather than
  pretending to succeed.
- Cloudinary transient failure (network, quota) → propagates as a 502-style
  `apiError`; the DB is never updated with a URL that didn't actually
  upload (upload happens before the DB write in the data flow above).
- Delete of an already-gone Cloudinary asset → swallowed, DB row is still
  removed from `photos` (matches existing "stale file" tolerance).

### Testing

- Server: unit tests per domain service (`hotel.service.spec.ts` etc. —
  extend where they exist, add where they don't) covering: upload appends
  to `photos`, cap enforcement, ownership rejection (403), moderation
  rejection propagates, delete removes the right URL by `publicId`, cover
  photo fallback (`photos[0] ?? busPhoto`) for buses/vehicles.
  `BusinessImageUploadService` gets its own unit test mocking
  `CloudinaryService` and `ModerationService`.
- Server: `CloudinaryService` itself is thin enough to skip deep unit
  testing (it's a direct SDK wrapper) but gets a smoke test that
  `isConfigured()` reflects `CLOUDINARY_URL` presence.
- Client: `photo-uploader.tsx` gets a component test (render, add files,
  delete, size/type rejection) following the existing pattern in
  `pending-business.spec.tsx` / `steps.spec.tsx`.
- Manual: run the dev stack, upload real photos through each of the six
  partner panels, confirm they render on the corresponding customer-facing
  listing page (hotel/bus/restaurant/grocery detail pages), confirm delete
  removes them from both the panel and the customer-facing page.

## Env / ops

Add to `server/.env.example`:

```
# Cloudinary — business image storage/CDN (hotel/room/bus/vehicle/restaurant/
# grocery photos). Get a free cloud at https://cloudinary.com, or use the
# Claimable Cloud flow for a no-signup dev cloud. Format:
# cloudinary://<api_key>:<api_secret>@<cloud_name>
CLOUDINARY_URL=
```

Boot-time behavior matches `AWS_REGION`: unset → warn loudly, don't crash
(dev/test keep working without real credentials); the upload endpoints
themselves 503 if hit while unconfigured.

## Decisions carried over from brainstorming

- **Storage: Cloudinary**, not local disk or S3 — chosen for CDN delivery
  and because local disk doesn't survive multiple server replicas.
- **Scope: all six business roles** (hotel, bus_operator, freight, driver,
  restaurant, grocery) in this build, not just the ones named in the
  original ask — same reusable building block, marginal cost per domain is
  low.
