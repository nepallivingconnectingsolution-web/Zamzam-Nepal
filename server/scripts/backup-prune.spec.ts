import { filesToDelete } from './backup-prune';

describe('filesToDelete', () => {
  const now = new Date('2026-08-17T00:00:00Z');

  it('keeps files within the retention window', () => {
    const files = [{ name: 'backup-2026-08-16.tar.gz', uploadedAt: new Date('2026-08-16T00:00:00Z') }];
    expect(filesToDelete(files, 30, now)).toEqual([]);
  });

  it('deletes files older than the retention window', () => {
    const files = [{ name: 'backup-2026-01-01.tar.gz', uploadedAt: new Date('2026-01-01T00:00:00Z') }];
    expect(filesToDelete(files, 30, now)).toEqual(['backup-2026-01-01.tar.gz']);
  });

  it('keeps a file exactly at the retention boundary', () => {
    const boundary = new Date(now.getTime() - 30 * 86_400_000);
    const files = [{ name: 'backup-boundary.tar.gz', uploadedAt: boundary }];
    expect(filesToDelete(files, 30, now)).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(filesToDelete([], 30, now)).toEqual([]);
  });

  it('only deletes the files that are actually old, from a mixed list', () => {
    const files = [
      { name: 'recent.tar.gz', uploadedAt: new Date('2026-08-10T00:00:00Z') },
      { name: 'old.tar.gz', uploadedAt: new Date('2026-01-01T00:00:00Z') },
    ];
    expect(filesToDelete(files, 30, now)).toEqual(['old.tar.gz']);
  });
});
