# Business Image Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every partner role (hotel, bus_operator, freight, driver, restaurant, grocery) upload and delete photos for the businesses/vehicles they own, stored on Cloudinary and served through their existing partner panels.

**Architecture:** One shared upload pipeline (`common/uploads` — magic-byte validation, Rekognition moderation, Cloudinary storage) reused by six small per-domain "add/delete photos" endpoint pairs, each bolted onto an existing partner controller/service using the ownership-check pattern already used everywhere in this codebase (`assertOwnedHotel`, `ownedVehicleOrFail`, etc). One shared React `<PhotoUploader>` wired into the five existing partner-manager pages (driver and freight share `VehiclePage.tsx`, so six roles → five client files).

**Tech Stack:** NestJS + Drizzle (server), React + Vite (client), `cloudinary` npm SDK, existing `ModerationService` (AWS Rekognition), existing multer/`FilesInterceptor` upload pattern, Jest (`ts-jest`) with the codebase's drizzle-chain-mock style for service tests, pglite-replayed migrations for the DB layer.

**Spec:** `docs/superpowers/specs/2026-09-22-business-image-uploads-design.md`

## Global Constraints

- Max 10 photos per entity (hotel, room type, bus, vehicle, restaurant, grocery store) — enforced server-side, batch-checked before any file in a request uploads (never a partial upload past the cap).
- Images only on these endpoints (no PDFs) — `validateUpload(file, { imagesOnly: true })`.
- 5 MB per file, matching every other upload endpoint in this codebase (`MAX_UPLOAD_BYTES` in the relocated `validate-upload.ts`).
- `busPhoto` (buses) and `photoRef` (vehicles) are never removed or migrated — reads fall back to them (`photos[0] ?? busPhoto`) so nothing existing breaks.
- Cloudinary config comes from one env var, `CLOUDINARY_URL`. Unset → uploads 503 cleanly; app still boots (dev/test never need real credentials — mirrors the existing `AWS_REGION` pattern for Rekognition).
- Delete routes identify a photo by its Cloudinary `publicId`, URL-encoded by the caller (it contains a `/` from the folder prefix, e.g. `zamzam-hotel%2Fabc123`). The client-side helper that builds delete URLs always calls `encodeURIComponent` on the publicId before interpolating it.
- Every new/changed server file follows this codebase's existing per-domain patterns exactly (ownership-check-then-mutate services, thin controllers, `apiError()` for HTTP errors, `id()` for generated ids) — no new abstractions beyond what the spec calls for.

---

## Task 1: Relocate the shared upload validator

**Files:**
- Create: `server/src/common/uploads/validate-upload.ts` (moved from `server/src/modules/driver-onboarding/files/file-validation.ts`, content unchanged)
- Create: `server/src/common/uploads/validate-upload.spec.ts` (moved from `server/src/modules/driver-onboarding/files/file-validation.spec.ts`, content unchanged except the import path)
- Delete: `server/src/modules/driver-onboarding/files/file-validation.ts`
- Delete: `server/src/modules/driver-onboarding/files/file-validation.spec.ts`
- Modify: `server/src/modules/driver-onboarding/application.controller.ts:22` (import path)

**Interfaces:**
- Produces: `validateUpload(file: { buffer: Buffer; mimetype: string; size: number }, opts?: { imagesOnly?: boolean }): { mime: UploadMime; ext: string }` and `export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;` and `export type UploadMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';` — all from `server/src/common/uploads/validate-upload.ts`. This is the exact function every later task's upload service calls.

- [ ] **Step 1: Move the two files with their content unchanged**

```bash
cd server
mkdir -p src/common/uploads
git mv src/modules/driver-onboarding/files/file-validation.ts src/common/uploads/validate-upload.ts
git mv src/modules/driver-onboarding/files/file-validation.spec.ts src/common/uploads/validate-upload.spec.ts
```

- [ ] **Step 2: Fix the spec's self-import**

In `server/src/common/uploads/validate-upload.spec.ts`, the only line that needs to change is the import (it was `./file-validation`, now the file it's testing has a new name but is still a sibling):

```ts
import { validateUpload } from './validate-upload';
```

- [ ] **Step 3: Fix the one external import**

`server/src/modules/driver-onboarding/application.controller.ts:22` currently reads:

```ts
import { MAX_UPLOAD_BYTES } from './files/file-validation';
```

Change to:

```ts
import { MAX_UPLOAD_BYTES } from '../../common/uploads/validate-upload';
```

- [ ] **Step 4: Run the moved test and the full suite**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/common/uploads/validate-upload.spec.ts
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts
```

Expected: all pass, nothing else broke (`driver-onboarding/files/` still has `files.controller.ts`, which doesn't import the validator — leave it in place).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: relocate validateUpload to common/uploads (now used by 6+ domains)"
```

---

## Task 2: Cloudinary service

**Files:**
- Create: `server/src/common/cloudinary/cloudinary.service.ts`
- Create: `server/src/common/cloudinary/cloudinary.module.ts`
- Create: `server/src/common/cloudinary/cloudinary.service.spec.ts`
- Modify: `server/package.json` (add `cloudinary` dependency)
- Modify: `server/.env.example` (document `CLOUDINARY_URL`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Task 3 and every domain service in Tasks 5–10):
  ```ts
  export interface UploadedImage { url: string; publicId: string; }

  @Injectable()
  export class CloudinaryService {
    isConfigured(): boolean;
    uploadImage(buffer: Buffer, folder: string): Promise<UploadedImage>; // rejects/503s if !isConfigured()
    deleteImage(publicId: string): Promise<void>; // best-effort, never throws
    publicIdFromUrl(url: string): string | null; // reverses uploadImage's url; null if the url wasn't ours
  }
  ```
  `CloudinaryModule` exports `CloudinaryService`.

- [ ] **Step 1: Install the SDK**

```bash
cd server
npm install cloudinary
```

- [ ] **Step 2: Write the service**

Create `server/src/common/cloudinary/cloudinary.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { apiError } from '../exceptions';

export interface UploadedImage {
  url: string;
  publicId: string;
}

/**
 * Every image this service uploads is delivered through this exact
 * transformation prefix (f_auto,q_auto — auto format/quality, baked into
 * the URL at upload time via cloudinary.url(), not left to per-request
 * transformation). publicIdFromUrl() depends on this being the only path
 * shape this service ever produces — don't change one without the other.
 */
const DELIVERY_PREFIX = '/image/upload/f_auto,q_auto/';

/**
 * Thin wrapper around the Cloudinary Node SDK. Configured from a single
 * CLOUDINARY_URL env var (cloudinary://key:secret@cloud_name). Mirrors how
 * ModerationService treats AWS_REGION: unset in dev/test is fine (uploads
 * just 503 if actually called), main.ts is expected to warn loudly on boot
 * if it's unset in production.
 */
@Injectable()
export class CloudinaryService {
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const url = config.get<string>('CLOUDINARY_URL');
    this.configured = Boolean(url);
    if (url) {
      // cloudinary.config(true) re-parses CLOUDINARY_URL from process.env —
      // the SDK's documented way to configure from a URL string you already
      // have (rather than relying on import-time env parsing, which would
      // race NestJS's own .env loading).
      process.env.CLOUDINARY_URL = url;
      cloudinary.config(true);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  uploadImage(buffer: Buffer, folder: string): Promise<UploadedImage> {
    if (!this.configured) {
      apiError(503, 'Image uploads are temporarily unavailable.', 'UPLOADS_UNCONFIGURED');
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `zamzam-${folder}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary upload failed'));
            return;
          }
          const url = cloudinary.url(result.public_id, {
            secure: true,
            resource_type: 'image',
            fetch_format: 'auto',
            quality: 'auto',
          });
          resolve({ url, publicId: result.public_id });
        },
      );
      stream.end(buffer);
    });
  }

  /** Best-effort: a failed delete just leaves an orphaned (harmless, still billed) Cloudinary asset — never blocks the caller. */
  async deleteImage(publicId: string): Promise<void> {
    if (!this.configured) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
      // orphaned asset, not worth failing the request over
    }
  }

  /** Reverses uploadImage()'s url. Returns null for any URL this service didn't generate (e.g. a stale/foreign URL). */
  publicIdFromUrl(url: string): string | null {
    const idx = url.indexOf(DELIVERY_PREFIX);
    return idx === -1 ? null : url.slice(idx + DELIVERY_PREFIX.length);
  }
}
```

- [ ] **Step 3: Write the module**

Create `server/src/common/cloudinary/cloudinary.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
```

- [ ] **Step 4: Write the test**

Create `server/src/common/cloudinary/cloudinary.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  async function build(cloudinaryUrl: string | undefined) {
    const module = await Test.createTestingModule({
      providers: [
        CloudinaryService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(cloudinaryUrl) } },
      ],
    }).compile();
    return module.get(CloudinaryService);
  }

  it('is not configured when CLOUDINARY_URL is unset', async () => {
    const service = await build(undefined);
    expect(service.isConfigured()).toBe(false);
  });

  it('is configured when CLOUDINARY_URL is set', async () => {
    const service = await build('cloudinary://key:secret@demo');
    expect(service.isConfigured()).toBe(true);
  });

  it('rejects uploadImage when unconfigured', async () => {
    const service = await build(undefined);
    await expect(service.uploadImage(Buffer.from('x'), 'hotel')).rejects.toThrow();
  });

  it('publicIdFromUrl reverses the URL shape this service produces', async () => {
    const service = await build('cloudinary://key:secret@demo');
    const url = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/zamzam-hotel/abc123';
    expect(service.publicIdFromUrl(url)).toBe('zamzam-hotel/abc123');
  });

  it('publicIdFromUrl returns null for a URL it did not generate', async () => {
    const service = await build('cloudinary://key:secret@demo');
    expect(service.publicIdFromUrl('https://example.com/photo.jpg')).toBeNull();
  });

  it('deleteImage on an unconfigured service resolves without throwing', async () => {
    const service = await build(undefined);
    await expect(service.deleteImage('whatever')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 5: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/common/cloudinary
```

Expected: 6 passing tests.

- [ ] **Step 6: Document the env var**

Append to `server/.env.example` (after the Rekognition/AWS block, or at the end of the file):

```
# Cloudinary — business image storage/CDN (hotel/room/bus/vehicle/restaurant/
# grocery photos). Get a free cloud at https://cloudinary.com, or use the
# Claimable Cloud flow for a no-signup dev cloud. Format:
# cloudinary://<api_key>:<api_secret>@<cloud_name>
# Unset in dev/test is fine — the app boots normally; upload endpoints will
# return a 503 if actually called without this set.
CLOUDINARY_URL=
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add CloudinaryService for business image storage"
```

---

## Task 3: Business image upload service

**Files:**
- Create: `server/src/common/uploads/business-image-upload.service.ts`
- Create: `server/src/common/uploads/business-uploads.module.ts`
- Create: `server/src/common/uploads/business-image-upload.service.spec.ts`

**Interfaces:**
- Consumes: `validateUpload` from Task 1 (`../uploads/validate-upload` — same directory now), `CloudinaryService` from Task 2, existing `ModerationService` from `server/src/common/moderation/moderation.service.ts`.
- Produces (used by every domain service in Tasks 5–10):
  ```ts
  export const MAX_BUSINESS_PHOTOS = 10;

  @Injectable()
  export class BusinessImageUploadService {
    upload(
      file: { buffer: Buffer; mimetype: string; size: number },
      folder: string,
    ): Promise<{ url: string; publicId: string }>;
  }
  ```
  `BusinessUploadsModule` exports both `BusinessImageUploadService` and `CloudinaryService` (via re-exporting `CloudinaryModule`) — a domain module only needs to import `BusinessUploadsModule` to get both.

- [ ] **Step 1: Write the service**

Create `server/src/common/uploads/business-image-upload.service.ts`:

```ts
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { validateUpload } from './validate-upload';
import { CloudinaryService, type UploadedImage } from '../cloudinary/cloudinary.service';
import { ModerationService } from '../moderation/moderation.service';

export const MAX_BUSINESS_PHOTOS = 10;

/**
 * The one path every business-photo upload goes through, regardless of
 * which domain (hotel/room/bus/vehicle/restaurant/grocery) is calling it:
 * validate the file signature, run content moderation (same Rekognition
 * call driver documents use, same fail-closed-on-error semantics), then
 * upload to Cloudinary. Each domain service calls this once per file and
 * handles its own DB array update — this service owns none of that state.
 */
@Injectable()
export class BusinessImageUploadService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly moderation: ModerationService,
  ) {}

  async upload(
    file: { buffer: Buffer; mimetype: string; size: number },
    folder: string,
  ): Promise<UploadedImage> {
    validateUpload(file, { imagesOnly: true });

    let result: { allowed: boolean; reasons: string[] };
    try {
      result = await this.moderation.checkImage(file.buffer);
    } catch {
      throw new UnprocessableEntityException(
        'Could not verify this image right now. Please try again in a moment.',
      );
    }
    if (!result.allowed) {
      throw new UnprocessableEntityException(
        'This image was flagged by automated content moderation and cannot be uploaded.',
      );
    }

    return this.cloudinary.uploadImage(file.buffer, folder);
  }
}
```

- [ ] **Step 2: Write the module**

Create `server/src/common/uploads/business-uploads.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BusinessImageUploadService } from './business-image-upload.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [ModerationModule, CloudinaryModule],
  providers: [BusinessImageUploadService],
  exports: [BusinessImageUploadService, CloudinaryModule],
})
export class BusinessUploadsModule {}
```

- [ ] **Step 3: Write the test**

Create `server/src/common/uploads/business-image-upload.service.spec.ts` (mirrors the existing `driver-documents.service.spec.ts` moderation-test style):

```ts
import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { BusinessImageUploadService } from './business-image-upload.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ModerationService } from '../moderation/moderation.service';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

describe('BusinessImageUploadService', () => {
  let moderation: { checkImage: jest.Mock };
  let cloudinary: { uploadImage: jest.Mock };
  let service: BusinessImageUploadService;

  beforeEach(async () => {
    moderation = { checkImage: jest.fn() };
    cloudinary = { uploadImage: jest.fn().mockResolvedValue({ url: 'https://cdn/x', publicId: 'zamzam-hotel/x' }) };

    const module = await Test.createTestingModule({
      providers: [
        BusinessImageUploadService,
        { provide: CloudinaryService, useValue: cloudinary },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();
    service = module.get(BusinessImageUploadService);
  });

  it('rejects a file whose bytes do not match a real image type', async () => {
    await expect(
      service.upload({ buffer: Buffer.from('not an image'), mimetype: 'image/jpeg', size: 12 }, 'hotel'),
    ).rejects.toThrow();
    expect(moderation.checkImage).not.toHaveBeenCalled();
  });

  it('rejects when moderation flags the image', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: false, reasons: ['Explicit Nudity (92%)'] });
    await expect(
      service.upload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }, 'hotel'),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects when the moderation call itself fails (fail closed)', async () => {
    moderation.checkImage.mockRejectedValue(new Error('AWS unavailable'));
    await expect(
      service.upload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }, 'hotel'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('uploads to Cloudinary once moderation allows it', async () => {
    moderation.checkImage.mockResolvedValue({ allowed: true, reasons: [] });
    const result = await service.upload({ buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length }, 'hotel');
    expect(result).toEqual({ url: 'https://cdn/x', publicId: 'zamzam-hotel/x' });
    expect(cloudinary.uploadImage).toHaveBeenCalledWith(jpeg, 'hotel');
  });
});
```

- [ ] **Step 4: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/common/uploads/business-image-upload.service.spec.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add BusinessImageUploadService (validate + moderate + upload)"
```

---

## Task 4: Schema migration — photos columns

**Files:**
- Modify: `server/src/database/schema.ts` (three tables)
- Create: `server/drizzle/00XX_<generated_name>.sql` (generated by drizzle-kit, don't hand-write)
- Create: `server/drizzle/meta/00XX_snapshot.json` (generated alongside it)
- Create: `server/test/integration/business-photos-migration.smoke.spec.ts`

**Interfaces:**
- Produces: `buses.photos`, `roomTypes.photos`, `vehicles.photos` — each `jsonb('photos').$type<string[]>().notNull().default([])`, used by every domain service in Tasks 6–8.

- [ ] **Step 1: Confirm a `.env` exists (drizzle-kit needs `DATABASE_URL` set to load its config, even though `generate` never dials it)**

```bash
cd server
test -f .env || cp .env.example .env
```

- [ ] **Step 2: Edit the schema**

In `server/src/database/schema.ts`, the `buses` table (around line 322-324) currently reads:

```ts
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    busPhoto: text('bus_photo'),
    isActive: boolean('is_active').notNull().default(true),
```

Change to:

```ts
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    busPhoto: text('bus_photo'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
```

The `roomTypes` table (around line 1192-1194) currently reads:

```ts
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

Change to:

```ts
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

The `vehicles` table (around line 668-669) currently reads:

```ts
    photoRef: text('photo_ref'),
    documentRef: text('document_ref'), // bluebook / registration document
```

Change to:

```ts
    photoRef: text('photo_ref'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    documentRef: text('document_ref'), // bluebook / registration document
```

- [ ] **Step 2: Generate the migration**

```bash
cd server
npm run db:generate -- --name add_business_photo_columns
```

Expected: a new file `drizzle/00XX_add_business_photo_columns.sql` (or drizzle-kit's auto name if `--name` isn't picked up — either is fine) containing three `ALTER TABLE ... ADD COLUMN "photos" jsonb DEFAULT '[]'::jsonb NOT NULL;` statements (one each for `buses`, `room_types`, `vehicles`), plus a matching `drizzle/meta/00XX_snapshot.json`.

- [ ] **Step 3: Inspect the generated SQL**

Open the new `.sql` file and confirm it contains exactly three `ALTER TABLE` statements touching `buses`, `room_types`, and `vehicles`, each adding a `photos` jsonb column — nothing else. If drizzle-kit generated anything unexpected (e.g. it tried to rename/drop a column), stop and re-check the schema edit in Step 2 before continuing.

- [ ] **Step 4: Write an integration smoke test**

Create `server/test/integration/business-photos-migration.smoke.spec.ts`:

```ts
import { createTestDb } from '../setup/test-db';
import { buses, roomTypes, vehicles, hotels, users } from '../../src/database/schema';
import { eq } from 'drizzle-orm';

describe('business photos migration', () => {
  it('buses, roomTypes and vehicles accept and round-trip a photos array', async () => {
    const { db, close } = await createTestDb();
    try {
      const [owner] = await db
        .insert(users)
        .values({
          id: 'usr_photo_test',
          name: 'Photo Test Owner',
          mobile: '9800000001',
          email: 'phototest@test.local',
          passwordHash: 'hash',
          role: 'bus_operator',
        })
        .returning();

      const [bus] = await db
        .insert(buses)
        .values({
          id: 'bus_phototest',
          operatorId: owner.id,
          busName: 'Test Bus',
          busNumber: 'BA-1',
          registrationNo: 'REG-1',
          type: 'AC',
          fuelType: 'Diesel',
          totalSeats: 40,
          totalRows: 10,
          photos: ['https://cdn/bus1.jpg'],
        })
        .returning();
      expect(bus.photos).toEqual(['https://cdn/bus1.jpg']);

      const [hotel] = await db
        .insert(hotels)
        .values({ id: 'htl_phototest', partnerId: owner.id, name: 'Test Hotel', city: 'Kathmandu', address: 'Addr' })
        .returning();

      const [room] = await db
        .insert(roomTypes)
        .values({
          id: 'rt_phototest',
          hotelId: hotel.id,
          name: 'Deluxe',
          pricePerNight: '1000',
          totalRooms: 5,
          photos: ['https://cdn/room1.jpg'],
        })
        .returning();
      expect(room.photos).toEqual(['https://cdn/room1.jpg']);

      const [vehicle] = await db
        .insert(vehicles)
        .values({
          id: 'veh_phototest',
          driverId: owner.id,
          category: 'car',
          makeModel: 'Test Car',
          plateNumber: 'BA1PA1111',
          plateNormalized: 'BA1PA1111',
          maxWeightKg: 100,
          photos: ['https://cdn/veh1.jpg'],
        })
        .returning();
      expect(vehicle.photos).toEqual(['https://cdn/veh1.jpg']);

      // Default is an empty array when photos is omitted entirely.
      const [defaultBus] = await db.select().from(buses).where(eq(buses.id, 'bus_phototest'));
      expect(Array.isArray(defaultBus.photos)).toBe(true);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 5: Run the full test suite**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts
```

Expected: all pass, including the new smoke test (confirms the generated migration replays cleanly against pglite).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add photos jsonb column to buses, room_types, vehicles"
```

---

## Task 5: Hotel property photos

**Files:**
- Modify: `server/src/modules/hotel/hotel.service.ts` (constructor + 3 new methods + `deleteHotel`)
- Modify: `server/src/modules/hotel/partner-hotels.controller.ts` (2 new routes)
- Modify: `server/src/modules/hotel/hotel.module.ts` (import `BusinessUploadsModule`)
- Create: `server/src/modules/hotel/hotel-photos.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessImageUploadService.upload(file, folder)`, `CloudinaryService.{deleteImage, publicIdFromUrl}`, `MAX_BUSINESS_PHOTOS` from Task 3.
- Produces: `HotelService.addHotelPhotos(partnerId, hotelId, files)` and `HotelService.deleteHotelPhoto(partnerId, hotelId, publicId)`, both returning the updated hotel row (`{ ...hotel, photos: string[] }`) — consumed by the client in Task 12.

- [ ] **Step 1: Add the constructor deps and photo methods to `HotelService`**

In `server/src/modules/hotel/hotel.service.ts`, update the imports and constructor:

```ts
import { BusinessImageUploadService, MAX_BUSINESS_PHOTOS } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
```

```ts
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
    private readonly businessImages: BusinessImageUploadService,
    private readonly cloudinary: CloudinaryService,
  ) {}
```

Add these methods right after `updateHotel` (before `deleteHotel`):

```ts
  async addHotelPhotos(partnerId: string, hotelId: string, files: Express.Multer.File[]) {
    const hotel = await this.assertOwnedHotel(partnerId, hotelId);
    if (hotel.photos.length + files.length > MAX_BUSINESS_PHOTOS) {
      apiError(400, `You can have at most ${MAX_BUSINESS_PHOTOS} photos — delete some before adding more.`);
    }
    const uploaded = await Promise.all(files.map((f) => this.businessImages.upload(f, 'hotel')));
    const photos = [...hotel.photos, ...uploaded.map((u) => u.url)];
    const [updated] = await this.db.update(hotels).set({ photos }).where(eq(hotels.id, hotelId)).returning();
    return updated;
  }

  async deleteHotelPhoto(partnerId: string, hotelId: string, publicId: string) {
    const hotel = await this.assertOwnedHotel(partnerId, hotelId);
    const url = hotel.photos.find((p) => this.cloudinary.publicIdFromUrl(p) === publicId);
    if (!url) apiError(404, 'Photo not found.');
    const photos = hotel.photos.filter((p) => p !== url);
    const [updated] = await this.db.update(hotels).set({ photos }).where(eq(hotels.id, hotelId)).returning();
    await this.cloudinary.deleteImage(publicId);
    return updated;
  }
```

Update `deleteHotel` to clean up any Cloudinary assets before the row is gone:

```ts
  async deleteHotel(partnerId: string, hotelId: string) {
    const hotel = await this.assertOwnedHotel(partnerId, hotelId);
    await this.db.delete(hotels).where(eq(hotels.id, hotelId));
    await Promise.allSettled(
      hotel.photos.map((url) => {
        const publicId = this.cloudinary.publicIdFromUrl(url);
        return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
      }),
    );
    return { ok: true };
  }
```

- [ ] **Step 2: Add the two routes to `PartnerHotelsController`**

In `server/src/modules/hotel/partner-hotels.controller.ts`, add imports:

```ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
```

Add these two methods inside `PartnerHotelsController`, right after `updateHotel`:

```ts
  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.hotel.addHotelPhotos(user.id, hotelId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.hotel.deleteHotelPhoto(user.id, hotelId, publicId);
  }
```

- [ ] **Step 3: Wire the module**

In `server/src/modules/hotel/hotel.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';
import { HotelsController } from './hotels.controller';
import { PartnerHotelsController, PartnerHotelMetricsController } from './partner-hotels.controller';
import { HotelService } from './hotel.service';

@Module({
  imports: [PartnerDocumentsModule, BusinessUploadsModule],
  controllers: [HotelsController, PartnerHotelsController, PartnerHotelMetricsController],
  providers: [HotelService],
  exports: [HotelService],
})
export class HotelModule {}
```

- [ ] **Step 4: Write the test**

Create `server/src/modules/hotel/hotel-photos.service.spec.ts` (mirrors the drizzle-chain-mock style in `driver-documents.service.spec.ts`):

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(name = 'a.jpg'): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: name, mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('HotelService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: HotelService;
  let hotelRow: { id: string; partnerId: string; photos: string[] };

  beforeEach(async () => {
    hotelRow = { id: 'htl_1', partnerId: 'u_1', photos: ['https://cdn/existing.jpg'] };
    businessImages = { upload: jest.fn() };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([hotelRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...hotelRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        HotelService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(HotelService);
  });

  it('rejects a non-owner from uploading photos', async () => {
    await expect(service.addHotelPhotos('someone_else', 'htl_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photo URLs to the existing array', async () => {
    businessImages.upload.mockResolvedValue({ url: 'https://cdn/new.jpg', publicId: 'zamzam-hotel/new' });
    await service.addHotelPhotos('u_1', 'htl_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/existing.jpg', 'https://cdn/new.jpg'] });
  });

  it('rejects a batch that would exceed the 10-photo cap', async () => {
    hotelRow.photos = new Array(9).fill('https://cdn/x.jpg');
    const files = [makeFile('a.jpg'), makeFile('b.jpg')];
    await expect(service.addHotelPhotos('u_1', 'htl_1', files)).rejects.toThrow();
    expect(businessImages.upload).not.toHaveBeenCalled();
  });

  it('deletes the matching photo and calls Cloudinary cleanup', async () => {
    cloudinary.publicIdFromUrl.mockImplementation((url: string) =>
      url === 'https://cdn/existing.jpg' ? 'zamzam-hotel/existing' : null,
    );
    await service.deleteHotelPhoto('u_1', 'htl_1', 'zamzam-hotel/existing');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-hotel/existing');
  });

  it('404s deleting a publicId that is not in the photos array', async () => {
    cloudinary.publicIdFromUrl.mockReturnValue('some-other-id');
    await expect(service.deleteHotelPhoto('u_1', 'htl_1', 'zamzam-hotel/missing')).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/modules/hotel/hotel-photos.service.spec.ts
```

Expected: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(hotel): add property photo upload/delete endpoints"
```

---

## Task 6: Hotel room-type photos

**Files:**
- Modify: `server/src/modules/hotel/hotel.service.ts` (2 new methods + `deleteRoomType` + `detail()`)
- Modify: `server/src/modules/hotel/partner-hotels.controller.ts` (2 new routes)
- Create: `server/src/modules/hotel/hotel-room-photos.service.spec.ts`

**Interfaces:**
- Consumes: same as Task 5 (already wired into `HotelService`'s constructor there).
- Produces: `HotelService.addRoomTypePhotos(partnerId, hotelId, roomTypeId, files)` and `HotelService.deleteRoomTypePhoto(partnerId, hotelId, roomTypeId, publicId)`, both returning the updated room-type row.

- [ ] **Step 1: Add the room-type photo methods**

In `server/src/modules/hotel/hotel.service.ts`, add these right after `updateRoomType` (before `deleteRoomType`):

```ts
  async addRoomTypePhotos(partnerId: string, hotelId: string, roomTypeId: string, files: Express.Multer.File[]) {
    const room = await this.assertOwnedRoomType(partnerId, hotelId, roomTypeId);
    if (room.photos.length + files.length > MAX_BUSINESS_PHOTOS) {
      apiError(400, `You can have at most ${MAX_BUSINESS_PHOTOS} photos — delete some before adding more.`);
    }
    const uploaded = await Promise.all(files.map((f) => this.businessImages.upload(f, 'hotel-room')));
    const photos = [...room.photos, ...uploaded.map((u) => u.url)];
    const [updated] = await this.db.update(roomTypes).set({ photos }).where(eq(roomTypes.id, roomTypeId)).returning();
    return { ...updated, pricePerNight: Number(updated.pricePerNight) };
  }

  async deleteRoomTypePhoto(partnerId: string, hotelId: string, roomTypeId: string, publicId: string) {
    const room = await this.assertOwnedRoomType(partnerId, hotelId, roomTypeId);
    const url = room.photos.find((p) => this.cloudinary.publicIdFromUrl(p) === publicId);
    if (!url) apiError(404, 'Photo not found.');
    const photos = room.photos.filter((p) => p !== url);
    const [updated] = await this.db.update(roomTypes).set({ photos }).where(eq(roomTypes.id, roomTypeId)).returning();
    await this.cloudinary.deleteImage(publicId);
    return { ...updated, pricePerNight: Number(updated.pricePerNight) };
  }
```

`deleteRoomType` currently reads:

```ts
  async deleteRoomType(partnerId: string, hotelId: string, roomTypeId: string) {
    await this.assertOwnedRoomType(partnerId, hotelId, roomTypeId);
    await this.db.delete(roomTypes).where(eq(roomTypes.id, roomTypeId));
    return { ok: true };
  }
```

Change to clean up Cloudinary assets on delete, same as the hotel-level delete:

```ts
  async deleteRoomType(partnerId: string, hotelId: string, roomTypeId: string) {
    const room = await this.assertOwnedRoomType(partnerId, hotelId, roomTypeId);
    await this.db.delete(roomTypes).where(eq(roomTypes.id, roomTypeId));
    await Promise.allSettled(
      room.photos.map((url) => {
        const publicId = this.cloudinary.publicIdFromUrl(url);
        return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
      }),
    );
    return { ok: true };
  }
```

- [ ] **Step 2: Expose room photos to customers**

`detail()`'s room-type mapping currently whitelists fields and drops `photos`:

```ts
      roomTypes: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pricePerNight: Number(r.pricePerNight),
        totalRooms: r.totalRooms,
        maxGuests: r.maxGuests,
        amenities: r.amenities,
      })),
```

Change to:

```ts
      roomTypes: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pricePerNight: Number(r.pricePerNight),
        totalRooms: r.totalRooms,
        maxGuests: r.maxGuests,
        amenities: r.amenities,
        photos: r.photos,
      })),
```

- [ ] **Step 3: Add the two routes to `PartnerHotelsController`**

Add right after `updateRoomType`:

```ts
  @Post(':id/room-types/:roomTypeId/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadRoomTypePhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Param('roomTypeId') roomTypeId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.hotel.addRoomTypePhotos(user.id, hotelId, roomTypeId, files);
  }

  @Delete(':id/room-types/:roomTypeId/photos/:publicId')
  deleteRoomTypePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Param('roomTypeId') roomTypeId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.hotel.deleteRoomTypePhoto(user.id, hotelId, roomTypeId, publicId);
  }
```

- [ ] **Step 4: Write the test**

Create `server/src/modules/hotel/hotel-room-photos.service.spec.ts`, same mocking style as Task 5's test but targeting `roomTypes`:

```ts
import { Test } from '@nestjs/testing';
import { HotelService } from './hotel.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('HotelService — room type photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: HotelService;
  let hotelRow: { id: string; partnerId: string };
  let roomRow: { id: string; hotelId: string; photos: string[]; pricePerNight: string };

  beforeEach(async () => {
    hotelRow = { id: 'htl_1', partnerId: 'u_1' };
    roomRow = { id: 'rt_1', hotelId: 'htl_1', photos: [], pricePerNight: '1000.00' };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/room.jpg', publicId: 'zamzam-hotel-room/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };

    // assertOwnedRoomType() calls assertOwnedHotel() first (1st .limit() call
    // resolves the hotel row), then selects the room itself (2nd .limit()
    // call resolves the room row) — this counter mocks that call order.
    let limitCallCount = 0;
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        limitCallCount += 1;
        return Promise.resolve(limitCallCount === 1 ? [hotelRow] : [roomRow]);
      }),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...roomRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        HotelService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(HotelService);
  });

  it('appends uploaded photos to the room type', async () => {
    await service.addRoomTypePhotos('u_1', 'htl_1', 'rt_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/room.jpg'] });
    expect(businessImages.upload).toHaveBeenCalledWith(expect.anything(), 'hotel-room');
  });
});
```

- [ ] **Step 5: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/modules/hotel
```

Expected: all hotel-module tests pass (Task 5's + this one).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(hotel): add room-type photo upload/delete endpoints, expose room photos to customers"
```

---

## Task 7: Bus photos

**Files:**
- Modify: `server/src/modules/buses/buses.service.ts` (constructor + 2 new methods + `deleteBus` + `search()` + `detail()`)
- Modify: `server/src/modules/buses/operator-buses.controller.ts` (2 new routes)
- Modify: `server/src/modules/buses/buses.module.ts` (import `BusinessUploadsModule`)
- Create: `server/src/modules/buses/bus-photos.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessImageUploadService`, `CloudinaryService`, `MAX_BUSINESS_PHOTOS` from Task 3.
- Produces: `BusesService.addBusPhotos(operatorId, busId, files)` and `BusesService.deleteBusPhoto(operatorId, busId, publicId)`, returning the updated bus row.

- [ ] **Step 1: Add the constructor deps**

In `server/src/modules/buses/buses.service.ts`, update imports and constructor:

```ts
import { BusinessImageUploadService, MAX_BUSINESS_PHOTOS } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
```

```ts
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
    private readonly businessImages: BusinessImageUploadService,
    private readonly cloudinary: CloudinaryService,
  ) {}
```

- [ ] **Step 2: Add photo methods and update `deleteBus`**

Add right after `registerBus`/`resolvePartnerDisplayName` (before `deleteBus`):

```ts
  private async ownedBusOrFail(operatorId: string, busId: string) {
    const [bus] = await this.db.select().from(buses).where(eq(buses.id, busId)).limit(1);
    if (!bus) apiError(404, 'Bus not found.');
    if (bus.operatorId !== operatorId) throw new ForbiddenException('Not your bus.');
    return bus;
  }

  async addBusPhotos(operatorId: string, busId: string, files: Express.Multer.File[]) {
    const bus = await this.ownedBusOrFail(operatorId, busId);
    if (bus.photos.length + files.length > MAX_BUSINESS_PHOTOS) {
      apiError(400, `You can have at most ${MAX_BUSINESS_PHOTOS} photos — delete some before adding more.`);
    }
    const uploaded = await Promise.all(files.map((f) => this.businessImages.upload(f, 'bus')));
    const photos = [...bus.photos, ...uploaded.map((u) => u.url)];
    const [updated] = await this.db.update(buses).set({ photos }).where(eq(buses.id, busId)).returning();
    return updated;
  }

  async deleteBusPhoto(operatorId: string, busId: string, publicId: string) {
    const bus = await this.ownedBusOrFail(operatorId, busId);
    const url = bus.photos.find((p) => this.cloudinary.publicIdFromUrl(p) === publicId);
    if (!url) apiError(404, 'Photo not found.');
    const photos = bus.photos.filter((p) => p !== url);
    const [updated] = await this.db.update(buses).set({ photos }).where(eq(buses.id, busId)).returning();
    await this.cloudinary.deleteImage(publicId);
    return updated;
  }
```

`deleteBus` currently reads:

```ts
  async deleteBus(operatorId: string, busId: string) {
    const [bus] = await this.db.select().from(buses).where(eq(buses.id, busId)).limit(1);
    if (!bus) apiError(404, 'Bus not found.');
    if (bus.operatorId !== operatorId) throw new ForbiddenException('Not your bus.');
    await this.db.delete(buses).where(eq(buses.id, busId)); // cascades to schedules -> trips via FK
    return { ok: true };
  }
```

Change to reuse the new helper and clean up Cloudinary assets:

```ts
  async deleteBus(operatorId: string, busId: string) {
    const bus = await this.ownedBusOrFail(operatorId, busId);
    await this.db.delete(buses).where(eq(buses.id, busId)); // cascades to schedules -> trips via FK
    await Promise.allSettled(
      bus.photos.map((url) => {
        const publicId = this.cloudinary.publicIdFromUrl(url);
        return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
      }),
    );
    return { ok: true };
  }
```

- [ ] **Step 3: Expose a cover photo to customers**

Bus photos live on `buses`, but the customer-facing `search()`/`detail()` query `trips` (denormalized departures), which don't carry photos. Join through `trips.busId` to pull a cover photo — and note the client already has full UI for this: `client/src/features/buses/types.ts`'s `BusSearchResult` already declares `busPhoto: string | null`, and `BusListPage.tsx:361-367` already renders it (`<img src={bus.busPhoto} .../>` with a "No bus photo yet" empty state) — it's just always been `undefined` because the server never populated it. So this step returns that *exact* existing field name, not a new one — no client changes needed for buses at all.

`search()` currently reads:

```ts
    const rows = await this.db
      .select({
        id: trips.id, fromCity: trips.fromCity, toCity: trips.toCity, date: trips.date,
        departure: trips.departure, arrival: trips.arrival, duration: trips.duration,
        price: trips.price, totalSeats: trips.totalSeats, bookedSeats: trips.bookedSeats,
        type: trips.type, amenities: trips.amenities,
        operatorName: users.name, businessName: users.businessName,
      })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.operatorId))
      .where(and(...conditions))
      .orderBy(asc(trips.date));

    return rows.map((t) => ({
      id: t.id,
      operator: t.businessName ?? t.operatorName ?? 'Operator',
      from: t.fromCity, to: t.toCity, date: t.date,
      departure: t.departure, arrival: t.arrival, duration: t.duration,
      price: Number(t.price),
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      type: t.type, amenities: t.amenities,
    }));
```

Change to:

```ts
    const rows = await this.db
      .select({
        id: trips.id, fromCity: trips.fromCity, toCity: trips.toCity, date: trips.date,
        departure: trips.departure, arrival: trips.arrival, duration: trips.duration,
        price: trips.price, totalSeats: trips.totalSeats, bookedSeats: trips.bookedSeats,
        type: trips.type, amenities: trips.amenities,
        operatorName: users.name, businessName: users.businessName,
        busPhotos: buses.photos, legacyBusPhoto: buses.busPhoto,
      })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.operatorId))
      .innerJoin(buses, eq(buses.id, trips.busId))
      .where(and(...conditions))
      .orderBy(asc(trips.date));

    return rows.map((t) => ({
      id: t.id,
      operator: t.businessName ?? t.operatorName ?? 'Operator',
      from: t.fromCity, to: t.toCity, date: t.date,
      departure: t.departure, arrival: t.arrival, duration: t.duration,
      price: Number(t.price),
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      type: t.type, amenities: t.amenities,
      busPhoto: t.busPhotos[0] ?? t.legacyBusPhoto ?? null,
    }));
```

`detail()` currently reads:

```ts
  async detail(tripId: string) {
    const [t] = await this.db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!t) apiError(404, 'This departure is no longer available.');

    const [operator] = await this.db
      .select({ name: users.name, businessName: users.businessName })
      .from(users).where(eq(users.id, t.operatorId)).limit(1);

    return {
      id: t.id,
      operator: operator?.businessName ?? operator?.name ?? 'Operator',
      from: t.fromCity, to: t.toCity, date: t.date,
      departure: t.departure, arrival: t.arrival, duration: t.duration,
      price: Number(t.price),
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      type: t.type, amenities: t.amenities,
      totalSeats: t.totalSeats, totalRows: t.totalRows, bookedSeats: t.bookedSeats,
      status: t.status === 'scheduled' ? ('active' as const) : t.status,
    };
  }
```

Change to:

```ts
  async detail(tripId: string) {
    const [t] = await this.db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!t) apiError(404, 'This departure is no longer available.');

    const [operator] = await this.db
      .select({ name: users.name, businessName: users.businessName })
      .from(users).where(eq(users.id, t.operatorId)).limit(1);

    const [bus] = await this.db
      .select({ photos: buses.photos, legacyBusPhoto: buses.busPhoto })
      .from(buses).where(eq(buses.id, t.busId)).limit(1);

    return {
      id: t.id,
      operator: operator?.businessName ?? operator?.name ?? 'Operator',
      from: t.fromCity, to: t.toCity, date: t.date,
      departure: t.departure, arrival: t.arrival, duration: t.duration,
      price: Number(t.price),
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      type: t.type, amenities: t.amenities,
      totalSeats: t.totalSeats, totalRows: t.totalRows, bookedSeats: t.bookedSeats,
      status: t.status === 'scheduled' ? ('active' as const) : t.status,
      busPhoto: bus?.photos[0] ?? bus?.legacyBusPhoto ?? null,
    };
  }
```

Note: `BusSearchResult`/`BusScheduleDetail` (in `client/src/features/buses/types.ts`) already declare `busPhoto: string | null` — no client type change needed, this step alone makes the existing UI light up.

- [ ] **Step 4: Add the two routes to `OperatorBusesController`**

Add imports:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
```

Add right after the `deleteBus` line:

```ts
  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') busId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.buses.addBusPhotos(user.id, busId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') busId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.buses.deleteBusPhoto(user.id, busId, publicId);
  }
```

- [ ] **Step 5: Wire the module**

In `server/src/modules/buses/buses.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BusesController } from './buses.controller';
import { OperatorBusesController } from './operator-buses.controller';
import { BusesService } from './buses.service';
import { BusesCronService } from './buses.cron';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';

@Module({
  imports: [PartnerDocumentsModule, BusinessUploadsModule],
  controllers: [BusesController, OperatorBusesController],
  providers: [BusesService, BusesCronService],
  exports: [BusesService],
})
export class BusesModule {}
```

- [ ] **Step 6: Write the test**

Create `server/src/modules/buses/bus-photos.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { BusesService } from './buses.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('BusesService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: BusesService;
  let busRow: { id: string; operatorId: string; photos: string[] };

  beforeEach(async () => {
    busRow = { id: 'bus_1', operatorId: 'u_1', photos: [] };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/bus.jpg', publicId: 'zamzam-bus/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([busRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...busRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        BusesService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyUser: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(BusesService);
  });

  it('rejects a non-operator from uploading photos', async () => {
    await expect(service.addBusPhotos('someone_else', 'bus_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photos to the bus', async () => {
    await service.addBusPhotos('u_1', 'bus_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/bus.jpg'] });
  });

  it('deletes the matching photo', async () => {
    busRow.photos = ['https://cdn/bus.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-bus/x');
    await service.deleteBusPhoto('u_1', 'bus_1', 'zamzam-bus/x');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-bus/x');
  });
});
```

- [ ] **Step 7: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/modules/buses/bus-photos.service.spec.ts
```

Note: per existing project context, `bus-booking` server suites were already failing to compile before this work (stale constructor args in other bus test files) — this is pre-existing and out of scope; confirm this new spec file passes on its own even if `npm test` overall still shows those unrelated pre-existing failures.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(buses): add bus photo upload/delete endpoints, expose cover photo to customers"
```

---

## Task 8: Vehicle photos (driver + freight)

**Files:**
- Modify: `server/src/modules/vehicles/vehicles.service.ts` (constructor + 2 new methods + `remove` + `toDto`)
- Modify: `server/src/modules/vehicles/vehicles.controller.ts` (2 new routes)
- Modify: `server/src/modules/vehicles/vehicles.module.ts` (import `BusinessUploadsModule`)
- Create: `server/src/modules/vehicles/vehicle-photos.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessImageUploadService`, `CloudinaryService`, `MAX_BUSINESS_PHOTOS` from Task 3.
- Produces: `VehiclesService.addVehiclePhotos(driverId, vehicleId, files)` and `VehiclesService.deleteVehiclePhoto(driverId, vehicleId, publicId)`, both returning the vehicle DTO (via the existing `toDto`).

- [ ] **Step 1: Add the constructor deps**

In `server/src/modules/vehicles/vehicles.service.ts`, update imports and constructor:

```ts
import { BusinessImageUploadService, MAX_BUSINESS_PHOTOS } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
```

```ts
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly businessImages: BusinessImageUploadService,
    private readonly cloudinary: CloudinaryService,
  ) {}
```

- [ ] **Step 2: Add photo methods**

Add right after `update` (before `setActive`):

```ts
  async addVehiclePhotos(driverId: string, vehicleId: string, files: Express.Multer.File[]) {
    const vehicle = await this.ownedVehicleOrFail(driverId, vehicleId);
    if (vehicle.photos.length + files.length > MAX_BUSINESS_PHOTOS) {
      apiError(400, `You can have at most ${MAX_BUSINESS_PHOTOS} photos — delete some before adding more.`);
    }
    const uploaded = await Promise.all(files.map((f) => this.businessImages.upload(f, 'vehicle')));
    const photos = [...vehicle.photos, ...uploaded.map((u) => u.url)];
    const [row] = await this.db.update(vehicles).set({ photos, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId)).returning();
    return this.toDto(row);
  }

  async deleteVehiclePhoto(driverId: string, vehicleId: string, publicId: string) {
    const vehicle = await this.ownedVehicleOrFail(driverId, vehicleId);
    const url = vehicle.photos.find((p) => this.cloudinary.publicIdFromUrl(p) === publicId);
    if (!url) apiError(404, 'Photo not found.');
    const photos = vehicle.photos.filter((p) => p !== url);
    const [row] = await this.db.update(vehicles).set({ photos, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId)).returning();
    await this.cloudinary.deleteImage(publicId);
    return this.toDto(row);
  }
```

`remove` (soft delete) currently reads:

```ts
  async remove(driverId: string, vehicleId: string) {
    await this.ownedVehicleOrFail(driverId, vehicleId);
    await this.db
      .update(vehicles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vehicles.id, vehicleId));
    await this.clearIfActive(driverId, vehicleId);
    return { ok: true };
  }
```

This is a soft delete (`isActive: false`), not a hard delete — the row and its Cloudinary photos stay intact in case the vehicle is ever reactivated by an admin. **No change needed here**; only a hard `db.delete()` would warrant Cloudinary cleanup, and vehicles never hard-delete.

- [ ] **Step 3: Expose photos in the DTO**

`toDto` currently reads:

```ts
  private toDto(row: typeof vehicles.$inferSelect) {
    return {
      id: row.id,
      driverId: row.driverId,
      category: row.category,
      services: CATEGORY_SERVICES[row.category],
      makeModel: row.makeModel,
      plateNumber: row.plateNumber,
      color: row.color,
      maxWeightKg: row.maxWeightKg,
      seats: row.seats,
      photoRef: row.photoRef,
      documentRef: row.documentRef,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }
```

Change to:

```ts
  private toDto(row: typeof vehicles.$inferSelect) {
    return {
      id: row.id,
      driverId: row.driverId,
      category: row.category,
      services: CATEGORY_SERVICES[row.category],
      makeModel: row.makeModel,
      plateNumber: row.plateNumber,
      color: row.color,
      maxWeightKg: row.maxWeightKg,
      seats: row.seats,
      photoRef: row.photoRef,
      photos: row.photos.length > 0 ? row.photos : row.photoRef ? [row.photoRef] : [],
      documentRef: row.documentRef,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }
```

- [ ] **Step 4: Add the two routes to `VehiclesController`**

Add imports:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
```

Add right after `update` (before `activate`):

```ts
  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.vehicles.addVehiclePhotos(user.id, vehicleId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.vehicles.deleteVehiclePhoto(user.id, vehicleId, publicId);
  }
```

- [ ] **Step 5: Wire the module**

In `server/src/modules/vehicles/vehicles.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';

@Module({
  imports: [BusinessUploadsModule],
  controllers: [VehiclesController, AdminVehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
```

- [ ] **Step 6: Write the test**

Create `server/src/modules/vehicles/vehicle-photos.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('VehiclesService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: VehiclesService;
  let vehicleRow: {
    id: string; driverId: string; isActive: boolean; photos: string[]; photoRef: string | null;
    category: string; createdAt: Date;
  };

  beforeEach(async () => {
    vehicleRow = {
      id: 'veh_1', driverId: 'u_1', isActive: true, photos: [], photoRef: null,
      category: 'car', createdAt: new Date(),
    };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/veh.jpg', publicId: 'zamzam-vehicle/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([vehicleRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...vehicleRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(VehiclesService);
  });

  it('appends uploaded photos and returns them in the DTO', async () => {
    const result = await service.addVehiclePhotos('u_1', 'veh_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/veh.jpg'], updatedAt: expect.any(Date) });
    expect(result.photos).toEqual(['https://cdn/veh.jpg']);
  });

  it('falls back to photoRef in the returned DTO once photos is empty again', async () => {
    vehicleRow.photos = ['https://cdn/veh.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-vehicle/x');
    // Simulates the post-delete DB row: photos is now empty, the legacy
    // photoRef is still set — toDto() should fall back to it.
    db.returning.mockResolvedValueOnce([{ ...vehicleRow, photos: [], photoRef: 'https://legacy/photo.jpg' }]);
    const result = await service.deleteVehiclePhoto('u_1', 'veh_1', 'zamzam-vehicle/x');
    expect(result.photos).toEqual(['https://legacy/photo.jpg']);
  });
});
```

- [ ] **Step 7: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/modules/vehicles/vehicle-photos.service.spec.ts
```

Expected: 2 passing tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(vehicles): add vehicle photo upload/delete endpoints (driver + freight)"
```

---

## Task 9: Restaurant photos

**Files:**
- Modify: `server/src/modules/restaurant/restaurant.service.ts` (constructor + 2 new methods + `deleteRestaurant`)
- Modify: `server/src/modules/restaurant/partner-restaurants.controller.ts` (2 new routes)
- Modify: `server/src/modules/restaurant/restaurant.module.ts` (import `BusinessUploadsModule`)
- Create: `server/src/modules/restaurant/restaurant-photos.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessImageUploadService`, `CloudinaryService`, `MAX_BUSINESS_PHOTOS` from Task 3.
- Produces: `RestaurantService.addRestaurantPhotos(partnerId, restaurantId, files)` and `RestaurantService.deleteRestaurantPhoto(partnerId, restaurantId, publicId)`.

(Restaurant `search()`/`detail()` already select `photos` from the `restaurants` table directly — no customer-facing read-path change needed here, unlike buses.)

- [ ] **Step 1: Add the constructor deps**

In `server/src/modules/restaurant/restaurant.service.ts`, add imports:

```ts
import { BusinessImageUploadService, MAX_BUSINESS_PHOTOS } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
```

The constructor currently reads:

```ts
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database,
  private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
) {}
```

Change to:

```ts
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
    private readonly businessImages: BusinessImageUploadService,
    private readonly cloudinary: CloudinaryService,
  ) {}
```

- [ ] **Step 2: Add photo methods and update `deleteRestaurant`**

Add right after `updateRestaurant`:

```ts
  async addRestaurantPhotos(partnerId: string, restaurantId: string, files: Express.Multer.File[]) {
    const restaurant = await this.assertOwnedRestaurant(partnerId, restaurantId);
    if (restaurant.photos.length + files.length > MAX_BUSINESS_PHOTOS) {
      apiError(400, `You can have at most ${MAX_BUSINESS_PHOTOS} photos — delete some before adding more.`);
    }
    const uploaded = await Promise.all(files.map((f) => this.businessImages.upload(f, 'restaurant')));
    const photos = [...restaurant.photos, ...uploaded.map((u) => u.url)];
    const [updated] = await this.db.update(restaurants).set({ photos }).where(eq(restaurants.id, restaurantId)).returning();
    return updated;
  }

  async deleteRestaurantPhoto(partnerId: string, restaurantId: string, publicId: string) {
    const restaurant = await this.assertOwnedRestaurant(partnerId, restaurantId);
    const url = restaurant.photos.find((p) => this.cloudinary.publicIdFromUrl(p) === publicId);
    if (!url) apiError(404, 'Photo not found.');
    const photos = restaurant.photos.filter((p) => p !== url);
    const [updated] = await this.db.update(restaurants).set({ photos }).where(eq(restaurants.id, restaurantId)).returning();
    await this.cloudinary.deleteImage(publicId);
    return updated;
  }
```

`deleteRestaurant` currently reads:

```ts
  async deleteRestaurant(partnerId: string, restaurantId: string) {
    await this.assertOwnedRestaurant(partnerId, restaurantId);
    await this.db.delete(restaurants).where(eq(restaurants.id, restaurantId));
    return { ok: true };
  }
```

Change to:

```ts
  async deleteRestaurant(partnerId: string, restaurantId: string) {
    const restaurant = await this.assertOwnedRestaurant(partnerId, restaurantId);
    await this.db.delete(restaurants).where(eq(restaurants.id, restaurantId));
    await Promise.allSettled(
      restaurant.photos.map((url) => {
        const publicId = this.cloudinary.publicIdFromUrl(url);
        return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
      }),
    );
    return { ok: true };
  }
```

- [ ] **Step 3: Add the two routes to `PartnerRestaurantsController`**

Add imports:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
```

Add right after `updateRestaurant` (before `deleteRestaurant`):

```ts
  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.restaurant.addRestaurantPhotos(user.id, restaurantId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') restaurantId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.restaurant.deleteRestaurantPhoto(user.id, restaurantId, publicId);
  }
```

- [ ] **Step 4: Wire the module**

In `server/src/modules/restaurant/restaurant.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';
import { RestaurantsController } from './restaurants.controller';
import {
  PartnerRestaurantsController,
  PartnerRestaurantMetricsController,
} from './partner-restaurants.controller';
import { RestaurantService } from './restaurant.service';

@Module({
  imports: [PartnerDocumentsModule, BusinessUploadsModule],
  controllers: [RestaurantsController, PartnerRestaurantsController, PartnerRestaurantMetricsController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
```

- [ ] **Step 5: Write the test**

Create `server/src/modules/restaurant/restaurant-photos.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('RestaurantService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: RestaurantService;
  let restaurantRow: { id: string; partnerId: string; photos: string[] };

  beforeEach(async () => {
    restaurantRow = { id: 'rst_1', partnerId: 'u_1', photos: [] };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/rst.jpg', publicId: 'zamzam-restaurant/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([restaurantRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...restaurantRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        RestaurantService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyUser: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(RestaurantService);
  });

  it('rejects a non-owner from uploading photos', async () => {
    await expect(service.addRestaurantPhotos('someone_else', 'rst_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photos to the restaurant', async () => {
    await service.addRestaurantPhotos('u_1', 'rst_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/rst.jpg'] });
  });

  it('rejects a batch that would exceed the 10-photo cap', async () => {
    restaurantRow.photos = new Array(9).fill('https://cdn/x.jpg');
    await expect(
      service.addRestaurantPhotos('u_1', 'rst_1', [makeFile(), makeFile()]),
    ).rejects.toThrow();
    expect(businessImages.upload).not.toHaveBeenCalled();
  });

  it('deletes the matching photo and calls Cloudinary cleanup', async () => {
    restaurantRow.photos = ['https://cdn/rst.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-restaurant/x');
    await service.deleteRestaurantPhoto('u_1', 'rst_1', 'zamzam-restaurant/x');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-restaurant/x');
  });
});
```

- [ ] **Step 6: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/modules/restaurant/restaurant-photos.service.spec.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(restaurant): add restaurant photo upload/delete endpoints"
```

---

## Task 10: Grocery store photos

**Files:**
- Modify: `server/src/modules/grocery/grocery.service.ts` (constructor + 2 new methods + `deleteStore`)
- Modify: `server/src/modules/grocery/partner-groceries.controller.ts` (2 new routes)
- Modify: `server/src/modules/grocery/grocery.module.ts` (import `BusinessUploadsModule`)
- Create: `server/src/modules/grocery/grocery-photos.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessImageUploadService`, `CloudinaryService`, `MAX_BUSINESS_PHOTOS` from Task 3.
- Produces: `GroceryService.addStorePhotos(partnerId, storeId, files)` and `GroceryService.deleteStorePhoto(partnerId, storeId, publicId)`.

Identical shape to Task 9, targeting `groceryStores` instead of `restaurants`.

- [ ] **Step 1: Add the constructor deps**

In `server/src/modules/grocery/grocery.service.ts`, add imports:

```ts
import { BusinessImageUploadService, MAX_BUSINESS_PHOTOS } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
```

The constructor currently reads:

```ts
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
) {}
```

Change to:

```ts
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,
    private readonly businessImages: BusinessImageUploadService,
    private readonly cloudinary: CloudinaryService,
  ) {}
```

- [ ] **Step 2: Add photo methods and update `deleteStore`**

Add right after `updateStore`:

```ts
  async addStorePhotos(partnerId: string, storeId: string, files: Express.Multer.File[]) {
    const store = await this.assertOwnedStore(partnerId, storeId);
    if (store.photos.length + files.length > MAX_BUSINESS_PHOTOS) {
      apiError(400, `You can have at most ${MAX_BUSINESS_PHOTOS} photos — delete some before adding more.`);
    }
    const uploaded = await Promise.all(files.map((f) => this.businessImages.upload(f, 'grocery')));
    const photos = [...store.photos, ...uploaded.map((u) => u.url)];
    const [updated] = await this.db.update(groceryStores).set({ photos }).where(eq(groceryStores.id, storeId)).returning();
    return updated;
  }

  async deleteStorePhoto(partnerId: string, storeId: string, publicId: string) {
    const store = await this.assertOwnedStore(partnerId, storeId);
    const url = store.photos.find((p) => this.cloudinary.publicIdFromUrl(p) === publicId);
    if (!url) apiError(404, 'Photo not found.');
    const photos = store.photos.filter((p) => p !== url);
    const [updated] = await this.db.update(groceryStores).set({ photos }).where(eq(groceryStores.id, storeId)).returning();
    await this.cloudinary.deleteImage(publicId);
    return updated;
  }
```

`deleteStore` currently reads:

```ts
  async deleteStore(partnerId: string, storeId: string) {
    await this.assertOwnedStore(partnerId, storeId);
    await this.db.delete(groceryStores).where(eq(groceryStores.id, storeId));
    return { ok: true };
  }
```

Change to:

```ts
  async deleteStore(partnerId: string, storeId: string) {
    const store = await this.assertOwnedStore(partnerId, storeId);
    await this.db.delete(groceryStores).where(eq(groceryStores.id, storeId));
    await Promise.allSettled(
      store.photos.map((url) => {
        const publicId = this.cloudinary.publicIdFromUrl(url);
        return publicId ? this.cloudinary.deleteImage(publicId) : Promise.resolve();
      }),
    );
    return { ok: true };
  }
```

- [ ] **Step 3: Add the two routes to `PartnerGroceriesController`**

Add imports:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
```

Add right after `updateStore` (before `deleteStore`):

```ts
  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.grocery.addStorePhotos(user.id, storeId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') storeId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.grocery.deleteStorePhoto(user.id, storeId, publicId);
  }
```

- [ ] **Step 4: Wire the module**

In `server/src/modules/grocery/grocery.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PartnerDocumentsModule } from '../partner-documents/partner-documents.module';
import { BusinessUploadsModule } from '../../common/uploads/business-uploads.module';
import { GroceriesController } from './groceries.controller';
import { PartnerGroceriesController, PartnerGroceryMetricsController } from './partner-groceries.controller';
import { GroceryService } from './grocery.service';

@Module({
  imports: [PartnerDocumentsModule, BusinessUploadsModule],
  controllers: [GroceriesController, PartnerGroceriesController, PartnerGroceryMetricsController],
  providers: [GroceryService],
  exports: [GroceryService],
})
export class GroceryModule {}
```

- [ ] **Step 5: Write the test**

Create `server/src/modules/grocery/grocery-photos.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { GroceryService } from './grocery.service';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';
import { BusinessImageUploadService } from '../../common/uploads/business-image-upload.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', fieldname: 'files',
    encoding: '7bit', size: 1, stream: undefined as never, destination: '', filename: '', path: '',
  };
}

describe('GroceryService — photos', () => {
  let db: any;
  let businessImages: { upload: jest.Mock };
  let cloudinary: { deleteImage: jest.Mock; publicIdFromUrl: jest.Mock };
  let service: GroceryService;
  let storeRow: { id: string; partnerId: string; photos: string[] };

  beforeEach(async () => {
    storeRow = { id: 'gst_1', partnerId: 'u_1', photos: [] };
    businessImages = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn/gst.jpg', publicId: 'zamzam-grocery/x' }) };
    cloudinary = { deleteImage: jest.fn(), publicIdFromUrl: jest.fn() };
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([storeRow]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockImplementation(() => Promise.resolve([{ ...storeRow }])),
    };

    const module = await Test.createTestingModule({
      providers: [
        GroceryService,
        { provide: DATABASE_CONNECTION, useValue: db },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyUser: jest.fn() } },
        { provide: PartnerDocumentsService, useValue: { assertRequiredDocsUploaded: jest.fn() } },
        { provide: BusinessImageUploadService, useValue: businessImages },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = module.get(GroceryService);
  });

  it('rejects a non-owner from uploading photos', async () => {
    await expect(service.addStorePhotos('someone_else', 'gst_1', [makeFile()])).rejects.toThrow(ForbiddenException);
  });

  it('appends uploaded photos to the store', async () => {
    await service.addStorePhotos('u_1', 'gst_1', [makeFile()]);
    expect(db.set).toHaveBeenCalledWith({ photos: ['https://cdn/gst.jpg'] });
  });

  it('rejects a batch that would exceed the 10-photo cap', async () => {
    storeRow.photos = new Array(9).fill('https://cdn/x.jpg');
    await expect(service.addStorePhotos('u_1', 'gst_1', [makeFile(), makeFile()])).rejects.toThrow();
    expect(businessImages.upload).not.toHaveBeenCalled();
  });

  it('deletes the matching photo and calls Cloudinary cleanup', async () => {
    storeRow.photos = ['https://cdn/gst.jpg'];
    cloudinary.publicIdFromUrl.mockReturnValue('zamzam-grocery/x');
    await service.deleteStorePhoto('u_1', 'gst_1', 'zamzam-grocery/x');
    expect(db.set).toHaveBeenCalledWith({ photos: [] });
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('zamzam-grocery/x');
  });
});
```

- [ ] **Step 6: Run it**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts src/modules/grocery/grocery-photos.service.spec.ts
```

Expected: all pass.

- [ ] **Step 7: Run the entire server suite**

```bash
cd server
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts
```

Expected: everything from Tasks 1–10 passes (aside from the pre-existing unrelated `bus-booking`/`wallet-topup` compile failures noted in project memory, which predate this work).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(grocery): add grocery store photo upload/delete endpoints"
```

---

## Task 11: Client — endpoints registry + shared `PhotoUploader`

**Files:**
- Modify: `client/src/api/client.ts` (add photo routes to 5 domains + `vehicles`)
- Create: `client/src/lib/cloudinary.ts`
- Create: `client/src/components/shared/photo-uploader.tsx`
- Create: `client/src/components/shared/photo-uploader.spec.tsx`

**Interfaces:**
- Produces: `cloudinaryPublicIdFromUrl(url: string): string | null` from `client/src/lib/cloudinary.ts`, and:
  ```tsx
  function PhotoUploader(props: {
    photos: string[];
    uploadUrl: string;
    deleteUrl: (encodedPublicId: string) => string;
    onChange: () => void;
    max?: number; // default 10
  }): JSX.Element
  ```
  consumed by Tasks 12–16.

- [ ] **Step 1: Add the client-side public-id parser**

Create `client/src/lib/cloudinary.ts`:

```ts
/**
 * Mirrors CloudinaryService.publicIdFromUrl on the server exactly — every
 * business photo URL this app ever displays was generated by that service
 * with this literal prefix baked in via cloudinary.url({fetch_format:'auto',
 * quality:'auto'}). Returns null for any URL that isn't ours (shouldn't
 * happen for photos this app uploaded, but a stale/legacy URL is handled
 * gracefully rather than throwing).
 */
const DELIVERY_PREFIX = "/image/upload/f_auto,q_auto/";

export function cloudinaryPublicIdFromUrl(url: string): string | null {
  const idx = url.indexOf(DELIVERY_PREFIX);
  return idx === -1 ? null : url.slice(idx + DELIVERY_PREFIX.length);
}
```

- [ ] **Step 2: Add the endpoints**

In `client/src/api/client.ts`, inside the `hotels.partner` block, add two entries after `roomType`:

```ts
      roomType: (hotelId: string, roomTypeId: string) => `/hotel/hotels/${hotelId}/room-types/${roomTypeId}`,
      hotelPhotos: (id: string) => `/hotel/hotels/${id}/photos`,
      hotelPhotoDelete: (id: string, publicId: string) => `/hotel/hotels/${id}/photos/${publicId}`,
      roomTypePhotos: (hotelId: string, roomTypeId: string) => `/hotel/hotels/${hotelId}/room-types/${roomTypeId}/photos`,
      roomTypePhotoDelete: (hotelId: string, roomTypeId: string, publicId: string) =>
        `/hotel/hotels/${hotelId}/room-types/${roomTypeId}/photos/${publicId}`,
```

Inside the `buses.op` block, add two entries after `bus`:

```ts
    bus: (id: string) => `/operator/buses/${id}`,
    busPhotos: (id: string) => `/operator/buses/${id}/photos`,
    busPhotoDelete: (id: string, publicId: string) => `/operator/buses/${id}/photos/${publicId}`,
```

Inside the top-level `vehicles` block, add two entries after `update`:

```ts
  vehicles: {
    register: "/vehicles",
    mine: "/vehicles/mine",
    update: (id: string) => `/vehicles/${id}`,
    photos: (id: string) => `/vehicles/${id}/photos`,
    photoDelete: (id: string, publicId: string) => `/vehicles/${id}/photos/${publicId}`,
    activate: (id: string) => `/vehicles/${id}/activate`,
    remove: (id: string) => `/vehicles/${id}`,
  },
```

Inside `restaurants.partner`, add two entries after `restaurant`:

```ts
      restaurant: (id: string) => `/restaurant/restaurants/${id}`,
      restaurantPhotos: (id: string) => `/restaurant/restaurants/${id}/photos`,
      restaurantPhotoDelete: (id: string, publicId: string) => `/restaurant/restaurants/${id}/photos/${publicId}`,
```

Inside `grocery.partner`, add two entries after `store`:

```ts
    store: (id: string) => `/grocery/stores/${id}`,
    storePhotos: (id: string) => `/grocery/stores/${id}/photos`,
    storePhotoDelete: (id: string, publicId: string) => `/grocery/stores/${id}/photos/${publicId}`,
```

Note: every `...PhotoDelete`/`photoDelete` function is called with an **already-`encodeURIComponent`'d** publicId by `PhotoUploader` (Step 3 below) — these functions just interpolate the string as-is, no double-encoding.

- [ ] **Step 3: Write the shared component**

Create `client/src/components/shared/photo-uploader.tsx`:

```tsx
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { cloudinaryPublicIdFromUrl } from "@/lib/cloudinary";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Thumbnail grid + add/delete, shared across every partner panel (hotel
 * property/rooms, bus fleet, vehicle, restaurant, grocery). Always refetches
 * via onChange() after a successful mutation rather than patching local
 * state — matches how every other list in these partner managers refreshes.
 */
export function PhotoUploader({
  photos,
  uploadUrl,
  deleteUrl,
  onChange,
  max = 10,
}: {
  photos: string[];
  uploadUrl: string;
  deleteUrl: (encodedPublicId: string) => string;
  onChange: () => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (photos.length + files.length > max) {
      toast.error(`You can have at most ${max} photos — delete some before adding more.`);
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        toast.error("Photos must be 5 MB or smaller.");
        return;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error("Upload a JPG, PNG or WEBP photo.");
        return;
      }
    }
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      await api.upload(uploadUrl, formData);
      toast.success(files.length > 1 ? "Photos uploaded" : "Photo uploaded");
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't upload photo. Try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(url: string) {
    const publicId = cloudinaryPublicIdFromUrl(url);
    if (!publicId) return;
    setDeletingUrl(url);
    try {
      await api.delete(deleteUrl(encodeURIComponent(publicId)));
      onChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete photo.");
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <div key={url} className="group relative size-20 overflow-hidden rounded-lg border border-border">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(url)}
              disabled={deletingUrl === url}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-fg transition-colors hover:bg-surface-2"
          >
            <ImagePlus className="size-4" />
            <span className="text-[10px]">{uploading ? "Uploading…" : "Add"}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write the component test**

This codebase's client tests run on **Vitest**, not Jest (`vi.mock`/`vi.fn`, not `jest.mock`/`jest.fn`) — see the existing pattern in `client/src/features/partner/pending-business.spec.tsx`. Create `client/src/components/shared/photo-uploader.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhotoUploader } from "./photo-uploader";

const upload = vi.fn();
const del = vi.fn();
vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, upload: (...a: unknown[]) => upload(...a), delete: (...a: unknown[]) => del(...a) } };
});

beforeEach(() => {
  upload.mockReset();
  del.mockReset();
});

describe("PhotoUploader", () => {
  it("renders one thumbnail per photo plus an add tile under the max", () => {
    render(
      <PhotoUploader photos={["https://cdn/a.jpg"]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={() => {}} />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("hides the add tile once the max is reached", () => {
    render(
      <PhotoUploader photos={["a", "b"]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={() => {}} max={2} />,
    );
    expect(screen.queryByText("Add")).not.toBeInTheDocument();
  });

  it("uploads a selected file and calls onChange on success", async () => {
    upload.mockResolvedValue({});
    const onChange = vi.fn();
    render(<PhotoUploader photos={[]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={onChange} />);

    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(upload).toHaveBeenCalledWith("/x/photos", expect.any(FormData)));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("rejects an oversized file client-side without calling the API", () => {
    const onChange = vi.fn();
    render(<PhotoUploader photos={[]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={onChange} />);

    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [big] } });

    expect(upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("deletes a photo by its derived publicId and calls onChange", async () => {
    del.mockResolvedValue({});
    const onChange = vi.fn();
    const deleteUrl = vi.fn((publicId: string) => `/x/photos/${publicId}`);
    render(
      <PhotoUploader
        photos={["https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/zamzam-hotel/abc123"]}
        uploadUrl="/x/photos"
        deleteUrl={deleteUrl}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remove photo"));

    await waitFor(() => expect(del).toHaveBeenCalledWith("/x/photos/zamzam-hotel%2Fabc123"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
```

- [ ] **Step 5: Run it**

```bash
cd client
npx vitest run src/components/shared/photo-uploader.spec.tsx
```

Expected: all 4 pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): add shared PhotoUploader component and photo endpoint routes"
```

---

## Task 12: Wire hotel property + room photos

**Files:**
- Modify: `client/src/features/hotels/types.ts` (`PartnerRoomType` gains `photos`)
- Modify: `client/src/features/hotels/HotelPartnerManager.tsx`

**Interfaces:**
- Consumes: `PhotoUploader` from Task 11, `endpoints.hotels.partner.{hotelPhotos,hotelPhotoDelete,roomTypePhotos,roomTypePhotoDelete}` from Task 11, server endpoints from Tasks 5–6.

- [ ] **Step 1: Add `photos` to `PartnerRoomType`**

In `client/src/features/hotels/types.ts`, find `export interface PartnerRoomType` and add `photos: string[];` as a field (matching the shape every other list field in that interface already has — `PartnerHotel` already has `photos: string[]` from the existing hotels table).

- [ ] **Step 2: Show property photos on the hotel card**

In `client/src/features/hotels/HotelPartnerManager.tsx`, add the import:

```ts
import { PhotoUploader } from "@/components/shared/photo-uploader";
```

`PropertiesTab`'s hotel card currently reads:

```tsx
              {expandedId === h.id && (
                <div className="border-t border-border p-5">
                  <RoomTypesPanel hotelId={h.id} />
                </div>
              )}
```

Change to:

```tsx
              {expandedId === h.id && (
                <div className="space-y-5 border-t border-border p-5">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-fg">Property photos</p>
                    <PhotoUploader
                      photos={h.photos}
                      uploadUrl={endpoints.hotels.partner.hotelPhotos(h.id)}
                      deleteUrl={(publicId) => endpoints.hotels.partner.hotelPhotoDelete(h.id, publicId)}
                      onChange={hotels.refetch}
                    />
                  </div>
                  <RoomTypesPanel hotelId={h.id} />
                </div>
              )}
```

- [ ] **Step 3: Show room photos in the room-type list**

`RoomTypesPanel`'s room row currently reads:

```tsx
          {rooms.data?.map((r) => (
            <div key={r.id} className="flex items-start justify-between rounded-xl border border-border p-3.5">
              <div>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-fg">
                  रू {r.pricePerNight.toLocaleString()}/night • {r.totalRooms} room(s) • up to {r.maxGuests} guests
                </p>
              </div>
              <button type="button" onClick={() => remove(r.id)} className="text-muted-fg hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
```

Change to:

```tsx
          {rooms.data?.map((r) => (
            <div key={r.id} className="space-y-2 rounded-xl border border-border p-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-fg">
                    रू {r.pricePerNight.toLocaleString()}/night • {r.totalRooms} room(s) • up to {r.maxGuests} guests
                  </p>
                </div>
                <button type="button" onClick={() => remove(r.id)} className="text-muted-fg hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <PhotoUploader
                photos={r.photos}
                uploadUrl={endpoints.hotels.partner.roomTypePhotos(hotelId, r.id)}
                deleteUrl={(publicId) => endpoints.hotels.partner.roomTypePhotoDelete(hotelId, r.id, publicId)}
                onChange={rooms.refetch}
                max={6}
              />
            </div>
          ))}
```

(`hotelId` is already in scope — it's `RoomTypesPanel`'s own prop.)

- [ ] **Step 4: Manually verify**

```bash
cd client
npm run dev
```

Log in as a `hotel` partner, expand a hotel, upload 2–3 property photos and 1–2 room photos, confirm thumbnails appear and delete works. Check the customer-facing hotel detail page shows the room photos (from Task 6's `detail()` change).

- [ ] **Step 5: Run the client test suite**

```bash
cd client
npx vitest run
```

Expected: everything passes (no existing hotel tests should break — this only adds a field and a component, doesn't remove anything).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): wire hotel property and room-type photo upload"
```

---

## Task 13: Wire bus photos

**Files:**
- Modify: `client/src/features/buses/types.ts` (`OperatorBus` gains `photos`)
- Modify: `client/src/features/buses/OperatorBusManager.tsx`

**Interfaces:**
- Consumes: `PhotoUploader`, `endpoints.buses.op.{busPhotos,busPhotoDelete}` from Task 11, server endpoints from Task 7.

- [ ] **Step 1: Add `photos` to `OperatorBus`**

In `client/src/features/buses/types.ts`, find `export interface OperatorBus` and add `photos: string[];`.

- [ ] **Step 2: Show photos on the bus card**

In `client/src/features/buses/OperatorBusManager.tsx`, add the import:

```ts
import { PhotoUploader } from "@/components/shared/photo-uploader";
```

`BusCard` needs a refetch callback for photo changes — it already receives `onRemoved`, which is `fleet.refetch` from `FleetTab`. `BusCard` currently reads:

```tsx
function BusCard({ bus, onRemoved }: { bus: OperatorBus; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.delete(endpoints.buses.op.bus(bus.id));
      toast.success("Bus removed", "It's no longer in your fleet.");
      onRemoved();
    } catch (e) {
      toast.error(errMsg(e, "Could not remove bus"));
      setRemoving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">{bus.busName}</h3>
          <p className="text-sm text-muted-fg">{bus.busNumber} • {bus.registrationNo}</p>
        </div>
        <Badge variant="accent">{bus.type}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-fg">
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{bus.totalSeats} seats</span>
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{bus.fuelType}</span>
        {bus.amenities.map((a) => (
          <span key={a} className="rounded-md bg-surface-2 px-2 py-0.5">{a}</span>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" disabled={removing} onClick={handleRemove}>
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>
    </Card>
  );
}
```

Change to (adds a photos section between the amenity chips and the Remove button):

```tsx
function BusCard({ bus, onRemoved }: { bus: OperatorBus; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.delete(endpoints.buses.op.bus(bus.id));
      toast.success("Bus removed", "It's no longer in your fleet.");
      onRemoved();
    } catch (e) {
      toast.error(errMsg(e, "Could not remove bus"));
      setRemoving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">{bus.busName}</h3>
          <p className="text-sm text-muted-fg">{bus.busNumber} • {bus.registrationNo}</p>
        </div>
        <Badge variant="accent">{bus.type}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-fg">
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{bus.totalSeats} seats</span>
        <span className="rounded-md bg-surface-2 px-2 py-0.5">{bus.fuelType}</span>
        {bus.amenities.map((a) => (
          <span key={a} className="rounded-md bg-surface-2 px-2 py-0.5">{a}</span>
        ))}
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-fg">Photos (exterior, interior, seating)</p>
        <PhotoUploader
          photos={bus.photos}
          uploadUrl={endpoints.buses.op.busPhotos(bus.id)}
          deleteUrl={(publicId) => endpoints.buses.op.busPhotoDelete(bus.id, publicId)}
          onChange={onRemoved}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" disabled={removing} onClick={handleRemove}>
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>
    </Card>
  );
}
```

(Reusing `onRemoved` as the photo-change callback is intentional — it's already `fleet.refetch` from the caller, and "something about this bus changed, refetch the fleet" is exactly what both cases need.)

- [ ] **Step 3: Manually verify**

```bash
cd client
npm run dev
```

Log in as a `bus_operator`, expand the Fleet tab, upload photos to a bus, confirm they appear, delete one, confirm it's gone. Search for a trip on that route as a customer and confirm the bus photo shows (from Task 7's `search()`/`detail()` join).

- [ ] **Step 4: Run the client test suite**

```bash
cd client
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): wire bus photo upload"
```

---

## Task 14: Wire vehicle photos (driver + freight)

**Files:**
- Modify: `client/src/features/driver/VehiclePage.tsx`

**Interfaces:**
- Consumes: `PhotoUploader`, `endpoints.vehicles.{photos,photoDelete}` from Task 11, server endpoints from Task 8.

`VehiclePage.tsx` is shared by both the `driver` and `freight` roles (same route component, per `client/src/routes/index.tsx`), so this one change covers both.

- [ ] **Step 1: Add `photos` to the local `Vehicle` interface**

`VehiclePage.tsx` currently reads:

```ts
interface Vehicle {
  id: string;
  category: "bike" | "car" | "van" | "mini_truck" | "truck";
  services: string[];
  makeModel: string;
  plateNumber: string;
  color: string | null;
  maxWeightKg: number;
  seats: number;
  verificationStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  isCurrentVehicle: boolean;
}
```

Change to:

```ts
interface Vehicle {
  id: string;
  category: "bike" | "car" | "van" | "mini_truck" | "truck";
  services: string[];
  makeModel: string;
  plateNumber: string;
  color: string | null;
  maxWeightKg: number;
  seats: number;
  photos: string[];
  verificationStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  isCurrentVehicle: boolean;
}
```

- [ ] **Step 2: Show photos on the vehicle card**

Add the import:

```ts
import { PhotoUploader } from "@/components/shared/photo-uploader";
```

The vehicle card currently reads:

```tsx
              <Card key={v.id} className={cn("flex flex-wrap items-center gap-4 p-4", v.isCurrentVehicle && "ring-1 ring-accent")}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <Car className="size-5 text-muted-fg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {v.makeModel}
                    <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-fg">{v.plateNumber}</span>
                  </p>
                  <p className="text-xs capitalize text-muted-fg">
                    {v.category.replace("_", " ")} · up to {v.maxWeightKg} kg · serves {v.services.join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {v.isCurrentVehicle ? (
                    <Badge variant="accent"><CheckCircle2 className="size-3" /> Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === v.id || v.verificationStatus !== "APPROVED"}
                      title={v.verificationStatus !== "APPROVED" ? "Available once an admin verifies this vehicle" : undefined}
                      onClick={() => activate(v.id)}
                    >
                      Set active
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busyId === v.id} onClick={() => remove(v.id)} aria-label="Remove vehicle">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {v.verificationStatus === "SUSPENDED" && (
                  <p className="flex w-full items-center gap-1.5 text-xs text-danger">
                    <ShieldAlert className="size-3.5" /> This vehicle was suspended by an admin and can't be used until re-approved.
                  </p>
                )}
              </Card>
```

Change to (adds a full-width photos row at the end of the card, before the suspended-warning line):

```tsx
              <Card key={v.id} className={cn("flex flex-wrap items-center gap-4 p-4", v.isCurrentVehicle && "ring-1 ring-accent")}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <Car className="size-5 text-muted-fg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {v.makeModel}
                    <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-fg">{v.plateNumber}</span>
                  </p>
                  <p className="text-xs capitalize text-muted-fg">
                    {v.category.replace("_", " ")} · up to {v.maxWeightKg} kg · serves {v.services.join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {v.isCurrentVehicle ? (
                    <Badge variant="accent"><CheckCircle2 className="size-3" /> Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === v.id || v.verificationStatus !== "APPROVED"}
                      title={v.verificationStatus !== "APPROVED" ? "Available once an admin verifies this vehicle" : undefined}
                      onClick={() => activate(v.id)}
                    >
                      Set active
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busyId === v.id} onClick={() => remove(v.id)} aria-label="Remove vehicle">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="w-full">
                  <p className="mb-2 text-xs font-medium text-muted-fg">Photos</p>
                  <PhotoUploader
                    photos={v.photos}
                    uploadUrl={endpoints.vehicles.photos(v.id)}
                    deleteUrl={(publicId) => endpoints.vehicles.photoDelete(v.id, publicId)}
                    onChange={vehicles.refetch}
                  />
                </div>
                {v.verificationStatus === "SUSPENDED" && (
                  <p className="flex w-full items-center gap-1.5 text-xs text-danger">
                    <ShieldAlert className="size-3.5" /> This vehicle was suspended by an admin and can't be used until re-approved.
                  </p>
                )}
              </Card>
```

- [ ] **Step 3: Manually verify**

```bash
cd client
npm run dev
```

Log in as a `driver`, add/upload vehicle photos, confirm they render and delete works. Repeat logged in as `freight` (same page).

- [ ] **Step 4: Run the client test suite**

```bash
cd client
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): wire vehicle photo upload (driver + freight)"
```

---

## Task 15: Wire restaurant photos

**Files:**
- Modify: `client/src/features/restaurants/RestaurantPartnerManager.tsx`

**Interfaces:**
- Consumes: `PhotoUploader`, `endpoints.restaurants.partner.{restaurantPhotos,restaurantPhotoDelete}` from Task 11, server endpoints from Task 9. `PartnerRestaurant` already has `photos: string[]` (existing type, unchanged).

- [ ] **Step 1: Show photos on the restaurant card**

Add the import:

```ts
import { PhotoUploader } from "@/components/shared/photo-uploader";
```

`RestaurantsTab`'s card currently reads:

```tsx
              {expandedId === r.id && (
                <div className="space-y-6 border-t border-border p-5">
                  <CategoriesPanel restaurantId={r.id} />
                  <MenuItemsPanel restaurantId={r.id} />
                </div>
              )}
```

Change to:

```tsx
              {expandedId === r.id && (
                <div className="space-y-6 border-t border-border p-5">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-fg">Restaurant photos</p>
                    <PhotoUploader
                      photos={r.photos}
                      uploadUrl={endpoints.restaurants.partner.restaurantPhotos(r.id)}
                      deleteUrl={(publicId) => endpoints.restaurants.partner.restaurantPhotoDelete(r.id, publicId)}
                      onChange={restaurants.refetch}
                    />
                  </div>
                  <CategoriesPanel restaurantId={r.id} />
                  <MenuItemsPanel restaurantId={r.id} />
                </div>
              )}
```

- [ ] **Step 2: Manually verify (partner side only — the customer-facing gallery is Task 17)**

```bash
cd client
npm run dev
```

Log in as a `restaurant` partner, upload photos, confirm thumbnails appear and delete works.

- [ ] **Step 3: Run the client test suite**

```bash
cd client
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(client): wire restaurant photo upload"
```

---

## Task 16: Wire grocery store photos

**Files:**
- Modify: `client/src/features/grocery/GroceryPartnerManager.tsx`

**Interfaces:**
- Consumes: `PhotoUploader`, `endpoints.grocery.partner.{storePhotos,storePhotoDelete}` from Task 11, server endpoints from Task 10. `PartnerStore` already has `photos: string[]` (existing type, unchanged).

- [ ] **Step 1: Show photos on the store card**

Add the import:

```ts
import { PhotoUploader } from "@/components/shared/photo-uploader";
```

`StoresTab`'s card currently reads:

```tsx
              {expandedId === s.id && (
                <div className="space-y-6 border-t border-border p-5">
                  <CategoriesPanel storeId={s.id} />
                  <ProductsPanel storeId={s.id} />
                </div>
              )}
```

Change to:

```tsx
              {expandedId === s.id && (
                <div className="space-y-6 border-t border-border p-5">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-fg">Store photos</p>
                    <PhotoUploader
                      photos={s.photos}
                      uploadUrl={endpoints.grocery.partner.storePhotos(s.id)}
                      deleteUrl={(publicId) => endpoints.grocery.partner.storePhotoDelete(s.id, publicId)}
                      onChange={stores.refetch}
                    />
                  </div>
                  <CategoriesPanel storeId={s.id} />
                  <ProductsPanel storeId={s.id} />
                </div>
              )}
```

- [ ] **Step 2: Manually verify (partner side only — the customer-facing gallery is Task 17)**

```bash
cd client
npm run dev
```

Log in as a `grocery` partner, upload store photos, confirm thumbnails appear and delete works.

- [ ] **Step 3: Run the client test suite**

```bash
cd client
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(client): wire grocery store photo upload"
```

---

## Task 17: Customer-facing photo galleries (hotel, restaurant, grocery)

**Files:**
- Create: `client/src/components/shared/photo-gallery.tsx`
- Modify: `client/src/features/hotels/types.ts` (`RoomTypeSummary` gains `photos`)
- Modify: `client/src/features/hotels/HotelDetailPage.tsx`
- Modify: `client/src/features/restaurants/RestaurantDetailPage.tsx`
- Modify: `client/src/features/grocery/GroceryDetailPage.tsx`

**Interfaces:**
- Consumes: `hotel.photos`/`restaurant.photos`/`store.photos` (already present in `HotelDetail`/`RestaurantDetail`/`StoreDetail` client types — server already returns them), `roomType.photos` (new, from Task 6's `detail()` change).
- Produces: `function PhotoGallery(props: { photos: string[]; alt: string }): JSX.Element | null` — a read-only horizontal thumbnail strip, renders nothing when `photos` is empty.

Buses are **not** part of this task — Task 7 already wires bus photos into the existing `bus.busPhoto` field and `BusListPage.tsx` already renders it; there is no bus-detail gallery to add.

- [ ] **Step 1: Write the shared read-only gallery**

Create `client/src/components/shared/photo-gallery.tsx`:

```tsx
/** Read-only horizontal thumbnail strip for a business's uploaded photos. Renders nothing when there are none. */
export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  if (photos.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {photos.map((url) => (
        <img
          key={url}
          src={url}
          alt={alt}
          className="h-40 w-56 shrink-0 rounded-xl border border-border object-cover"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `photos` to `RoomTypeSummary`**

In `client/src/features/hotels/types.ts`, `RoomTypeSummary` currently reads:

```ts
export interface RoomTypeSummary {
  id: string;
  name: string;
  description: string | null;
  pricePerNight: number;
  totalRooms: number;
  maxGuests: number;
  amenities: string[];
}
```

Change to:

```ts
export interface RoomTypeSummary {
  id: string;
  name: string;
  description: string | null;
  pricePerNight: number;
  totalRooms: number;
  maxGuests: number;
  amenities: string[];
  photos: string[];
}
```

- [ ] **Step 3: Wire into `HotelDetailPage.tsx`**

Add the import:

```ts
import { PhotoGallery } from "@/components/shared/photo-gallery";
```

`BookingFlow`'s stepper section currently starts with:

```tsx
  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-6 pb-24">
        {/* Stepper */}
        <div className="flex items-center gap-2">
```

Change to (adds the property gallery once, above the stepper):

```tsx
  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-6 pb-24">
        <PhotoGallery photos={hotel.photos} alt={hotel.name} />
        {/* Stepper */}
        <div className="flex items-center gap-2">
```

The room-type selection button currently reads:

```tsx
                <button key={r.id} type="button" onClick={() => setRoomType(r)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                    roomType?.id === r.id ? "border-teal-700 bg-teal-100 dark:border-accent dark:bg-white/10" : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-fg">Sleeps up to {r.maxGuests} guests</p>
                    {r.description && <p className="mt-0.5 truncate text-xs text-muted-fg">{r.description}</p>}
                  </div>
                  <p className="shrink-0 whitespace-nowrap font-display text-sm font-bold font-tabular">रू {r.pricePerNight.toLocaleString()}/night</p>
                </button>
```

Change to (adds a small thumbnail when the room has photos — this is the "hotel room images" the user specifically asked for):

```tsx
                <button key={r.id} type="button" onClick={() => setRoomType(r)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    roomType?.id === r.id ? "border-teal-700 bg-teal-100 dark:border-accent dark:bg-white/10" : "border-border hover:bg-surface-2",
                  )}
                >
                  {r.photos[0] && (
                    <img src={r.photos[0]} alt={r.name} className="size-12 shrink-0 rounded-lg border border-border object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-fg">Sleeps up to {r.maxGuests} guests</p>
                    {r.description && <p className="mt-0.5 truncate text-xs text-muted-fg">{r.description}</p>}
                  </div>
                  <p className="shrink-0 whitespace-nowrap font-display text-sm font-bold font-tabular">रू {r.pricePerNight.toLocaleString()}/night</p>
                </button>
```

- [ ] **Step 4: Wire into `RestaurantDetailPage.tsx`**

Add the import:

```ts
import { PhotoGallery } from "@/components/shared/photo-gallery";
```

Find `OrderFlow`'s top-level return (the outermost `<div className="space-y-6">` or equivalent wrapper that starts its JSX, analogous to `HotelDetailPage.tsx`'s `BookingFlow`) and add `<PhotoGallery photos={restaurant.photos} alt={restaurant.name} />` as its first child, the same way Step 3 added it to `BookingFlow` — above whatever stepper/menu UI `OrderFlow` renders first. (`OrderFlow` receives its restaurant object as the `restaurant` prop, per `RestaurantDetailPage`'s existing `<OrderFlow restaurant={detail.data} .../>` call.)

- [ ] **Step 5: Wire into `GroceryDetailPage.tsx`**

Same as Step 4, for `OrderFlow`'s `store` prop in `GroceryDetailPage.tsx`: add the import and `<PhotoGallery photos={store.photos} alt={store.name} />` as the first child of `OrderFlow`'s returned JSX.

- [ ] **Step 6: Manually verify**

```bash
cd client
npm run dev
```

As a customer, open a hotel detail page for a hotel whose partner uploaded photos in Task 12 — confirm the property gallery renders and each room with photos shows its thumbnail. Repeat for a restaurant (Task 15) and a grocery store (Task 16).

- [ ] **Step 7: Run the client test suite**

```bash
cd client
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(client): show uploaded business photos on customer-facing detail pages"
```

- [ ] **Step 9: Run the full client + server test suites one last time**

```bash
cd client && npx vitest run
cd ../server && npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.ts
```

Expected: everything green (aside from the pre-existing unrelated `bus-booking`/`wallet-topup` compile failures noted in Task 7, which predate this work).
