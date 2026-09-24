# Driver + Vehicle Onboarding, Verification and Dispatch - Design

Date: 2026-09-21. Extends the existing ZamZam driver stack; does not replace it.

## Decisions (confirmed with the product owner)
- **Extend, not rebuild.** Existing `/driver/*`, `/vehicles/*`, `/rides/*` routes keep working.
- **Phone OTP:** new `OtpService` behind a `SmsProvider` interface. Adapters: `SparrowSmsProvider` (prod, needs `SPARROW_SMS_TOKEN`, `SPARROW_SMS_FROM`) and `ConsoleSmsProvider` (dev only, logs the code; refused when `NODE_ENV=production`). OTP is stored hashed (sha256) in a Postgres `phone_otps` table (testable with pglite, works without Redis): 5 min TTL, max 5 verify attempts, max 3 sends per 10 min per number.
- **Driver login change (required):** today `AuthService.register` creates drivers as `kycStatus=PENDING` with no tokens and `login` rejects PENDING/SUSPENDED (403), so a driver could never reach the wizard. For `role='driver'` only: register issues tokens, and login is allowed while PENDING or SUSPENDED. Access to driver-privileged actions is gated by `DriverEligibilityService`, not by login. Partners and customers are unchanged. `users.kycStatus` for drivers mirrors the application decision (PENDING until APPROVED, SUSPENDED when suspended).
- **Vehicle status mapping:** the spec's `vehicle.status = ACTIVE` maps to the existing columns `vehicles.verificationStatus='APPROVED' AND vehicles.isActive=true`. No new vehicle status enum.
- **Storage:** `StorageService` interface. `LocalPrivateStorage` writes to `UPLOAD_PRIVATE_DIR` (outside any static-served path). Files are streamed only by authenticated endpoints that check ownership or admin role. Existing public `/uploads/driver-documents` files stay readable until migrated; new uploads never go there.
- **Realtime:** SSE stream `GET /driver/stream` for offers/status; Redis GEO for live locations; driver app falls back to polling `/driver/offers/pending`.
- **Delivery:** all four phases, one checkpoint at the end.

## Data model (Drizzle, migration 0026+)
New enums: `application_status` (DRAFT, SUBMITTED, UNDER_REVIEW, RESUBMISSION_REQUIRED, APPROVED, REJECTED, SUSPENDED, EXPIRED); `review_status` (PENDING, APPROVED, REJECTED, EXPIRED, RESUBMISSION_REQUIRED); `offer_status` (PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED). Existing `kyc_status` is not altered.

New tables:
- `driver_profiles` (user_id unique FK, legal_name, photo_file_id, dob, gender, address, city, province, emergency_contact_name/phone, language, licence_number, licence_class, licence_authority, licence_issue_date, licence_expiry_date, phone_verified_at).
- `driver_applications` (id, user_id unique FK, status, current_step, submitted_at, reviewed_at, reviewed_by, rejection_reason, version int for optimistic locking).
- `stored_files` (id, owner_user_id, storage_key, original_name, mime, size_bytes, created_at). Private files only.
- `application_documents` (id, application_id, subject: DRIVER|VEHICLE, vehicle_id nullable, doc_type, file_id, expiry_date, status review_status, rejection_reason, reviewed_by, reviewed_at, superseded_by nullable). One *current* row per (application, subject, vehicle, doc_type) via partial unique index `WHERE superseded_by IS NULL`; resubmission inserts a new row and supersedes the old one, so history is kept.
- `vehicle_photos` (id, vehicle_id, angle, file_id, status, rejection_reason, reviewed_*), current-row rule same as documents.
- `document_requirements` (id, vehicle_type, service_class nullable, subject, doc_type, is_required, requires_expiry). Admin-editable; seeded with production defaults in the migration (Bike: bluebook, insurance; Car: bluebook, insurance, road tax). This is configuration, not mock data.
- `vehicle_photo_requirements` (vehicle_type, angle, is_required).
- `verification_reviews` (id, application_id, target_type, target_id, action, from_status, to_status, reason, admin_id, created_at).
- `ride_offers` (id, ride_id, driver_id, status, pickup_distance_m, eta_min, expires_at, created_at, responded_at); unique `(ride_id, driver_id)`.
- Location history is sampled (one point per ride event/minute) into `driver_location_log`; live position is Redis GEO only.

Changes to existing tables:
- `vehicles`: add `plate_normalized` (varchar, uppercase alphanumerics only), `make`, `model`, `manufacture_year`, `registration_year`, `fuel_type`, `service_class`. Drop the global unique `vehicles_plate_unique_idx`; add unique index on `plate_normalized WHERE is_active = true` (soft-deleted vehicles free their plate). Backfill `plate_normalized` in the migration.
- Ride statuses in this codebase are `REQUESTED, ACCEPTED, ONGOING, PAYMENT_PENDING, COMPLETED, CANCELLED`. Add a partial unique index `rides_one_active_per_driver` on `rides(driver_id) WHERE status IN ('ACCEPTED','ONGOING','PAYMENT_PENDING')` so a driver holds at most one active ride at the database level.
- `driver_status.online` stays the ONLINE/OFFLINE source of truth; BUSY is derived (online and has an active ride); SUSPENDED is derived from the application.
- Services in this codebase are `taxi | bike | parcel`; car vehicles serve `taxi`, bikes serve `bike`. Offers use these existing service names and the existing `SERVICE_CATEGORIES` mapping.
- Legacy `driver_documents` rows are copied into `application_documents` by the migration; the legacy table stays for the old endpoints.

## Application state machine
DRAFT -> SUBMITTED -> UNDER_REVIEW -> (APPROVED | REJECTED | RESUBMISSION_REQUIRED).
RESUBMISSION_REQUIRED -> SUBMITTED (after the driver replaces the flagged items). APPROVED <-> SUSPENDED (admin, reason required). APPROVED -> EXPIRED (nightly job or check-on-use when licence or a required document expires); replacing the expired document returns it to SUBMITTED. All transitions go through one `ApplicationStateMachine.transition()` that validates the edge, runs in a transaction, bumps `version` with `WHERE version = :expected`, and writes `verification_reviews` + `audit_logs`. Two admins reviewing at once: the second write fails with 409 "already changed, reload".

Submit gate (server-side): profile complete, licence fields present and `expiry > today`, an active vehicle with normalized plate not owned by another active driver, every required document and photo present, no expired documents.

Final-approve gate: every required current document/photo is APPROVED; otherwise 409 "Application cannot be approved because N required documents are still pending." Approve sets application APPROVED, vehicle status ACTIVE, and `driver_status` to OFFLINE-eligible.

## Eligibility (single source of truth)
`DriverEligibilityService.check(driverId, serviceType)` returns `{ eligible, reasons[] }`. It verifies: user exists and role driver; application APPROVED; not suspended; active vehicle ACTIVE and not suspended; vehicle type matches service; licence expiry in future; all required documents APPROVED and unexpired; driver ONLINE (for matching) with fresh location (< 60 s); no active ride. Go-online calls it (skipping the ONLINE and location-freshness checks and requiring a location fix); matching calls it per candidate.

## Dispatch
1. `POST /rides` (existing) creates the ride REQUESTED, then `DispatchService.start(rideId)`.
2. Candidates: Redis `GEOSEARCH` by pickup within a configurable radius, sorted by distance, then filtered through eligibility. Offer to the nearest N (config `OFFER_BATCH_SIZE`, default 3) with `OFFER_TTL_SECONDS` (default 15). Offers are pushed over SSE.
3. Accept runs in one transaction: `SELECT ... FOR UPDATE` on the ride row and on the driver's `driver_status` row, verify offer PENDING and unexpired, ride REQUESTED with no driver, driver has no active ride, then update ride (ACCEPTED, driver_id), offer ACCEPTED, other offers CANCELLED, driver BUSY. The partial unique index is the backstop. Losing racers get a friendly 409.
4. Expiry sweeper (interval job) marks stale offers EXPIRED and widens to the next batch; after max rounds the ride is left REQUESTED for the existing poll path so behaviour never regresses.
5. Existing `GET /rides/incoming` and `POST /rides/:id/accept` stay, and `accept` is routed through the same transactional method.

## API (new, existing conventions: no global prefix)
Driver: `POST /driver/otp/send`, `POST /driver/otp/verify`, `GET/PUT /driver/application` (draft per step), `POST /driver/application/files` (multipart), `DELETE /driver/application/files/:id` (draft only), `POST /driver/application/submit`, `GET /driver/application/status`, `PUT /driver/vehicle/draft`, `POST /driver/documents/:id/replace`, `GET /driver/files/:id` (owner only), `POST /driver/go-online`, `POST /driver/go-offline`, `GET /driver/stream`, `POST /driver/location`, `GET /driver/offers/pending`, `POST /driver/offers/:id/accept|decline`.
Public config: `GET /driver/requirements?vehicleType=`.
Super-admin (existing `SuperAdminAuthGuard`): `GET /super-admin/driver-applications` (status, q, sort, page) + `/stats`, `GET /super-admin/driver-applications/:id`, `PATCH .../documents/:docId/approve|reject`, `PATCH .../photos/:id/approve|reject`, `POST .../approve|reject|request-resubmission|suspend|reactivate`, `POST .../notes`, `GET /super-admin/files/:id`, `GET/PUT /super-admin/document-requirements`.

## Frontend
- Driver: `features/driver/onboarding/*` wizard (Personal, Licence, Vehicle, Documents, Photos, Review) with server-persisted draft plus localStorage mirror for refresh safety; status page (pending/rejected/resubmit/approved/suspended); go-online button on the dashboard driven by the eligibility reasons; offer sheet with countdown. Reuses `otp-input`, `phone-field`, `bottom-sheet`, `date-field`, `async-states`, `driver-shell`, and the existing six-colour palette.
- Super-admin: `SuperAdminDriverApplications` list (filters, search, sort, stats cards) and `SuperAdminDriverApplicationDetail` with nine sections, per-item approve/reject dialogs requiring a reason. New sidebar entry only.

## Testing
Jest unit tests: plate normalization, state machine edges, submit/approve gates, eligibility matrix, OTP limits. Integration tests on pglite/real Postgres: duplicate plate, resubmission history, concurrent accept (two drivers, one ride; one driver, two rides), suspend forces offline, expiry-to-EXPIRED. Client vitest for wizard step validation. End-to-end walk-through at the end using the running stack.

## Out of scope
Payment changes, passenger UI, other modules, real SMS sends in dev, migrating existing public uploads to private storage.

## Revisions made while building (this section wins over the text above)
- Vehicle photos are documents with `doc_type` `photo:*` in `application_documents`; there are no separate `vehicle_photos` / `vehicle_photo_requirements` tables.
- Submit lands in `SUBMITTED` ("Pending verification") and moves to `UNDER_REVIEW` when an admin opens the application or reviews a document.
- Drivers approved before this feature are grandfathered (`driver_applications.is_legacy`): document checks are skipped until they resubmit; licence and suspension checks still apply if data exists.
- Login for drivers is allowed while PENDING or SUSPENDED (the portal is gated by `RequireApprovedDriver`, actions by `DriverEligibilityService`).
- `POST /driver/status` (legacy toggle) may go online without coordinates and waits for the first ping; `POST /driver/go-online` requires a location.
- Migration `0026_driver_onboarding.sql` is hand-written (drizzle snapshots stop at 0021). The one-active-ride index predicate uses only the original ride_status values so a fresh database can migrate in one transaction.
- Age (18+) is checked for drivers; Nepal plate format is enforced for bike/car only.
