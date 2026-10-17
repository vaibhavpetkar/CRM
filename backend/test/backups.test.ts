import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The service reads BACKUP_DIR when it loads, so point it at a scratch folder first.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-backups-test-'));
process.env.BACKUP_DIR = dir;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const backups = require('../src/services/backupService') as typeof import('../src/services/backupService');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { superAdminOnly, requireSuperAdmin } = require('../src/middleware/superAdmin') as typeof import('../src/middleware/superAdmin');

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('accepts only well-formed backup names', () => {
  for (const ok of [
    'crm-manual-20261017-023000Z.dump',
    'crm-auto-20261017-023000Z.dump',
    'crm-pre-restore-20261017-023000Z.dump',
    'crm-uploaded-20261017-023000Z-2.dump',
  ]) {
    assert.equal(backups.isValidBackupName(ok), true, ok);
    assert.equal(backups.isValidBackupFileName(ok), true, ok);
  }
  assert.equal(backups.isValidBackupFileName('crm-manual-20261017-023000Z.uploads.tar.gz'), true);
  // The uploads archive is downloadable but is not itself a restorable backup.
  assert.equal(backups.isValidBackupName('crm-manual-20261017-023000Z.uploads.tar.gz'), false);
});

test('rejects path traversal and anything else', () => {
  for (const bad of [
    '',
    '../crm-manual-20261017-023000Z.dump',
    '..%2Fcrm-manual-20261017-023000Z.dump',
    'crm-manual-20261017-023000Z.dump/../../etc/passwd',
    '/etc/passwd',
    'crm-manual-20261017-023000Z.dump\0.txt',
    'crm-manual-20261017-023000Z.dump.part',
    '.upload-abc.part',
    'crm-evil-20261017-023000Z.dump',
    'crm-manual-2026101-023000Z.dump',
    'crm-manual-20261017-023000Z-1234.dump',
    'CRM-MANUAL-20261017-023000Z.DUMP',
    'crm-manual-20261017-023000Z.sql',
    ' crm-manual-20261017-023000Z.dump',
    'crm-manual-20261017-023000Z.dump\n',
  ]) {
    assert.equal(backups.isValidBackupFileName(bad), false, JSON.stringify(bad));
    assert.throws(() => backups.resolveBackupFile(bad), /Invalid backup name/, JSON.stringify(bad));
  }
  for (const notString of [null, undefined, 42, {}, ['crm-manual-20261017-023000Z.dump']]) {
    assert.equal(backups.isValidBackupFileName(notString), false);
  }
  assert.equal(backups.resolveBackupFile('crm-manual-20261017-023000Z.dump'), path.join(dir, 'crm-manual-20261017-023000Z.dump'));
});

test('names carry the UTC time they were taken', () => {
  const at = new Date(Date.UTC(2026, 9, 17, 2, 3, 4));
  const name = backups.newBackupName('manual', at);
  assert.equal(name, 'crm-manual-20261017-020304Z.dump');
  assert.equal(backups.parseBackupDate(name)?.toISOString(), '2026-10-17T02:03:04.000Z');
  fs.writeFileSync(path.join(dir, name), 'PGDMP');
  // Same second again: gets a suffix instead of overwriting.
  assert.equal(backups.newBackupName('manual', at), 'crm-manual-20261017-020304Z-2.dump');
  fs.rmSync(path.join(dir, name));
});

test('lists backups newest first and prunes beyond BACKUP_KEEP', () => {
  const names = [
    'crm-manual-20261001-000000Z.dump',
    'crm-auto-20261002-000000Z.dump',
    'crm-pre-restore-20261003-000000Z.dump',
  ];
  for (const n of names) fs.writeFileSync(path.join(dir, n), 'PGDMP-test');
  fs.writeFileSync(path.join(dir, 'crm-manual-20261001-000000Z.uploads.tar.gz'), 'tar');
  fs.writeFileSync(path.join(dir, '.upload-temp.part'), 'ignored');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

  const list = backups.listBackups();
  assert.deepEqual(list.map((b) => b.name), [...names].reverse());
  assert.equal(list[2].uploadsArchive?.name, 'crm-manual-20261001-000000Z.uploads.tar.gz');
  assert.equal(list[0].kind, 'pre-restore');
  assert.equal(list[0].size, 10);

  process.env.BACKUP_KEEP = '2';
  try {
    assert.deepEqual(backups.pruneBackups(), ['crm-manual-20261001-000000Z.dump']);
  } finally {
    delete process.env.BACKUP_KEEP;
  }
  assert.equal(fs.existsSync(path.join(dir, 'crm-manual-20261001-000000Z.uploads.tar.gz')), false);
  assert.equal(backups.listBackups().length, 2);
  for (const n of names) fs.rmSync(path.join(dir, n), { force: true });
});

test('an uploaded file that is not a pg_dump archive is refused and removed', async () => {
  const temp = path.join(dir, '.upload-test.part');
  fs.writeFileSync(temp, 'DROP TABLE users;');
  await assert.rejects(backups.restoreUploadedFile(temp), /not a pg_dump custom-format backup/);
  assert.equal(fs.existsSync(temp), false);
  // Files outside the backups folder are never touched.
  await assert.rejects(backups.restoreUploadedFile('/etc/passwd'), /Invalid upload/);
});

test('daily schedule waits until the next HH:MM in IST', () => {
  // 2026-10-17 20:00 UTC is 2026-10-18 01:30 IST, so 02:30 IST is one hour away.
  const now = new Date(Date.UTC(2026, 9, 17, 20, 0, 0));
  assert.equal(backups.msUntilNextDaily('02:30', now), 60 * 60 * 1000);
  // 01:00 IST already passed today: tomorrow, 23.5 hours away.
  assert.equal(backups.msUntilNextDaily('01:00', now), 23.5 * 60 * 60 * 1000);
  assert.equal(backups.msUntilNextDaily('25:00', now), null);
  assert.equal(backups.msUntilNextDaily('2:3', now), null);
  assert.equal(backups.msUntilNextDaily('', now), null);
});

const runGuard = (user: unknown) => {
  let status = 200;
  let body: unknown = null;
  let nextCalled = false;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  };
  superAdminOnly({ user } as any, res as any, () => {
    nextCalled = true;
  });
  return { status, body, nextCalled };
};

test('only the super admin gets through', () => {
  assert.equal(requireSuperAdmin, superAdminOnly);
  assert.deepEqual(runGuard({ id: 1, isSuperAdmin: true }), { status: 200, body: null, nextCalled: true });

  // A company Administrator with every permission is still not the super admin.
  const admin = runGuard({ id: 2, isSuperAdmin: false, role: { name: 'Administrator', permissions: '["*"]' } });
  assert.equal(admin.status, 403);
  assert.equal(admin.nextCalled, false);

  for (const user of [{ id: 3 }, { id: 4, isSuperAdmin: 'true' }, { id: 5, isSuperAdmin: 1 }]) {
    const r = runGuard(user);
    assert.equal(r.status, 403, JSON.stringify(user));
    assert.equal(r.nextCalled, false);
  }

  const anonymous = runGuard(undefined);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.nextCalled, false);
});
