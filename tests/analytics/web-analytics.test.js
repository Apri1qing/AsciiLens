import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function listFiles(relDir, acc = []) {
  const dir = join(root, relDir);
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${relDir}/${name.name}`;
    if (name.isDirectory()) listFiles(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

test('main.jsx injects default Vercel Web Analytics with no custom options', () => {
  const source = read('src/main.jsx');
  assert.match(source, /import \{ inject \} from '@vercel\/analytics'/);
  assert.match(source, /\binject\(\)/);
  assert.doesNotMatch(source, /\binject\(\s*\{/);
  assert.doesNotMatch(source, /import \{[^}]*\b(track|pageview)\b[^}]*\} from '@vercel\/analytics'/);
});

test('application source does not add WA custom events, UTM, or virtual page helpers', () => {
  const files = [
    'src/main.jsx',
    'src/App.jsx',
    'src/pages/Studio.jsx',
    'src/components/studio/EditorPanel.jsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /from '@vercel\/analytics\/(react|next)'/,
      `${file} must not use a framework-specific WA adapter`,
    );
    if (file !== 'src/main.jsx') {
      assert.doesNotMatch(source, /from '@vercel\/analytics'/, `${file} must not import WA`);
    }
    assert.doesNotMatch(source, /import \{[^}]*\b(track|pageview)\b[^}]*\} from '@vercel\/analytics'/);
    assert.doesNotMatch(source, /\bpageview\s*\(/);
    assert.doesNotMatch(source, /utm(Source|Campaign|Medium|Content|Term)/i);
  }
});

test('custom audit client, proxy, worker, and tests are gone', () => {
  for (const rel of [
    'src/lib/audit.js',
    'api/audit/event.js',
    'api/audit/summary.js',
    'server/audit-utils.js',
    'shared/audit.js',
    'shared/audit-event.js',
    'workers/audit/index.js',
    'workers/audit/storage.js',
    'workers/audit/wrangler.jsonc',
    'tests/audit/proxy.test.js',
    'tests/audit/core.test.js',
    'docs/audit.md',
    'docs/audit-cloudflare-migration.md',
    'docs/audit-history-import.md',
  ]) {
    assert.equal(existsSync(join(root, rel)), false, `${rel} must be removed`);
  }

  const studio = read('src/pages/Studio.jsx');
  const editor = read('src/components/studio/EditorPanel.jsx');
  assert.doesNotMatch(studio, /trackAuditEvent/);
  assert.doesNotMatch(editor, /trackAuditEvent/);
  assert.doesNotMatch(studio, /\/api\/audit/);
  assert.doesNotMatch(editor, /\/api\/audit/);
});

test('package.json depends on @vercel/analytics and has no audit tests', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(typeof pkg.dependencies['@vercel/analytics'], 'string');
  assert.equal(pkg.scripts['test:audit'], undefined);
  assert.match(pkg.scripts['test:analytics'], /tests\/analytics/);
});

test('src and api production paths do not call /api/audit or the Worker', () => {
  const files = [...listFiles('src'), ...listFiles('api')];
  assert.ok(files.length > 0, 'expected application source files');
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\/api\/audit/, `${file} must not call /api/audit`);
    assert.doesNotMatch(source, /trackAuditEvent/, `${file} must not call trackAuditEvent`);
    assert.doesNotMatch(source, /AUDIT_WORKER_URL/, `${file} must not read AUDIT_WORKER_URL`);
    assert.doesNotMatch(source, /asciilens-audit/, `${file} must not reference asciilens-audit`);
  }
});

test('production build includes the WA script path and omits the audit beacon', (t) => {
  const distAssets = join(root, 'dist/assets');
  if (!existsSync(distAssets)) {
    t.skip('dist/ not built yet');
    return;
  }
  const bundles = readdirSync(distAssets).filter((name) => name.endsWith('.js'));
  assert.ok(bundles.length > 0, 'expected hashed JS assets in dist/assets');
  const combined = bundles.map((name) => read(`dist/assets/${name}`)).join('\n');
  assert.match(combined, /_vercel\/insights/);
  assert.doesNotMatch(combined, /\/api\/audit\/event/);
  assert.doesNotMatch(combined, /trackAuditEvent/);
});
