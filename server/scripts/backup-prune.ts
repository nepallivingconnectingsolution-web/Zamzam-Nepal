export interface BackupFile {
  name: string;
  uploadedAt: Date;
}

/**
 * Returns the names of backup files older than `retentionDays`, relative
 * to `now`. Pure function — the B2 list/delete calls live in backup.sh,
 * which shells out to this via a small tsx invocation so the actual
 * "what's too old" decision is unit-tested instead of only ever exercised
 * against a real bucket.
 */
export function filesToDelete(files: BackupFile[], retentionDays: number, now: Date): string[] {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return files.filter((f) => f.uploadedAt.getTime() < cutoff).map((f) => f.name);
}
