import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

export async function applyMigration(db, migration) {
  const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8');
  // Known repository SQL: trigger bodies terminate on the same line as END.
  const statements = sql.replace(/^--.*$/gmu, '').split(/;\s*(?:\n|$)/u).map(value => value.trim()).filter(Boolean);
  await db.batch(statements.map(statement => db.prepare(statement)));
}

export async function localHistoryDatabase({ history = true } = {}) {
  const mf = new Miniflare({
    scriptPath: fileURLToPath(new URL('../index.js', import.meta.url)),
    modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    modulesRoot: fileURLToPath(new URL('../../../', import.meta.url)),
    compatibilityDate: '2026-07-30', cf: false,
    bindings: { AUDIT_PROXY_TOKEN: 'local-history-test-only', AUDIT_HISTORY_ENABLED: 'true' },
    d1Databases: { AUDIT_DB: 'asciilens-history-ephemeral-local-only' },
    outboundService() { throw new Error('No external requests permitted'); },
  });
  try {
    const db = await mf.getD1Database('AUDIT_DB');
    await applyMigration(db, '0001_audit.sql');
    if (history) await applyMigration(db, '0002_history.sql');
    return { mf, db };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
