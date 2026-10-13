import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareImport } from './prepare.js';
import { stageImport, stagingCommands, verifyImport } from './importer.js';

export async function run(args) {
  const [mode, backupPath, manifestPath, outputPath, ...extra] = args;
  if (!['prepare', 'rehearse'].includes(mode) || !backupPath || !manifestPath || !outputPath || extra.length) {
    throw new Error('Usage: node history/cli.js prepare|rehearse BACKUP.ndjson SOURCE-MANIFEST.json NEW-PRIVATE-OUTPUT-DIRECTORY');
  }
  if ((await stat(backupPath)).size > 128 * 1024 * 1024 || (await stat(manifestPath)).size > 4 * 1024 * 1024) throw new Error('Input exceeds reviewed offline size limit');
  const prepared = prepareImport(await readFile(backupPath), JSON.parse(await readFile(manifestPath, 'utf8')));
  // Refuse to reuse a directory, avoiding accidental overwrites of backups or receipts.
  await mkdir(outputPath, { mode: 0o700 });
  const save = (name, value) => writeFile(join(outputPath, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await save('plan.json', prepared);
  const commands = stagingCommands(prepared);
  const batches = [];
  for (let index = 0; index < commands.length; index += 50) batches.push(commands.slice(index, index + 50));
  await save('staging-batches.json', { format: 'd1-prepared-batches-v1', importId: prepared.importId, batches });
  if (mode === 'rehearse') {
    const { localHistoryDatabase } = await import('./local-db.js');
    const { mf, db } = await localHistoryDatabase();
    try {
      await stageImport(db, prepared);
      const receipt = await verifyImport(db, prepared);
      await save('LOCAL-REHEARSAL-ONLY.json', { ...receipt, environment: 'ephemeral_local_D1', productionImportConfirmed: false });
    } finally {
      await mf.dispose();
    }
  }
  return { mode, importId: prepared.importId, rows: prepared.rows.length, productionImportConfirmed: false, sourceDeletionApproved: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(() => {
    // No file contents, raw rows, SQL errors or provider credentials in stdout/stderr.
    console.error('History preparation/rehearsal failed. No production action was attempted. Check input checksums, source reconciliation and the new output directory.');
    process.exitCode = 1;
  });
}
