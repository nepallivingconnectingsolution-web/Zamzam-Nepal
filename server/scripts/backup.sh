#!/bin/sh
# Nightly backup: dumps Postgres, tars the uploads volume, pushes both to
# Backblaze B2 via its S3-compatible API, then prunes anything older than
# BACKUP_RETENTION_DAYS. Runs inside the `backup` compose service, which
# has the `postgres` and `uploads_data` volumes/network available.
set -eu

DATE=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP_FILE="/tmp/pg-${DATE}.sql.gz"
UPLOADS_FILE="/tmp/uploads-${DATE}.tar.gz"
PRIVATE_FILE="/tmp/private-uploads-${DATE}.tar.gz"

echo "[backup] dumping postgres..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$DUMP_FILE"

echo "[backup] archiving uploads..."
tar -czf "$UPLOADS_FILE" -C /app uploads

# Driver identity documents live in a separate, non-public volume.
if [ -d /app/private-uploads ]; then
  echo "[backup] archiving private uploads..."
  tar -czf "$PRIVATE_FILE" -C /app private-uploads
fi

echo "[backup] uploading to B2..."
aws s3 cp "$DUMP_FILE" "s3://${B2_BUCKET}/postgres/" --endpoint-url "$B2_ENDPOINT"
aws s3 cp "$UPLOADS_FILE" "s3://${B2_BUCKET}/uploads/" --endpoint-url "$B2_ENDPOINT"
if [ -f "$PRIVATE_FILE" ]; then
  aws s3 cp "$PRIVATE_FILE" "s3://${B2_BUCKET}/private-uploads/" --endpoint-url "$B2_ENDPOINT"
fi

echo "[backup] pruning backups older than ${BACKUP_RETENTION_DAYS} days..."
npx tsx /app/scripts/prune-b2.ts

rm -f "$DUMP_FILE" "$UPLOADS_FILE" "$PRIVATE_FILE"
echo "[backup] done."
