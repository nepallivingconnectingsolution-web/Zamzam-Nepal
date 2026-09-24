-- Vehicle insurance and vehicle photos are no longer compulsory. A driver may
-- still upload them (and reviewers still review whatever is uploaded), but
-- their absence no longer blocks submitting or approving an application.
-- Everything else (licence, ID, bluebook, road tax) stays required.
-- Admins can flip any of these back with PUT /super-admin/driver-applications/requirements.
UPDATE "document_requirements"
SET "is_required" = false
WHERE "doc_type" = 'insurance' OR "kind" = 'PHOTO';
