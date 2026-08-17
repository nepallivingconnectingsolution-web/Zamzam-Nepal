import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { filesToDelete } from './backup-prune';

async function main() {
  const client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
  });
  const bucket = process.env.B2_BUCKET!;
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

  for (const prefix of ['postgres/', 'uploads/']) {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const files = (listed.Contents ?? [])
      .filter((o) => o.Key && o.LastModified)
      .map((o) => ({ name: o.Key!, uploadedAt: o.LastModified! }));

    const toDelete = filesToDelete(files, retentionDays, new Date());
    for (const name of toDelete) {
      console.log(`[prune-b2] deleting ${name}`);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: name }));
    }
  }
}

main().catch((err) => {
  console.error('[prune-b2] failed:', err);
  process.exit(1);
});
