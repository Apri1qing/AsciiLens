import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
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
    'src/lib/audit.js',
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

test('custom audit client, proxy, and worker remain in place', () => {
  const audit = read('src/lib/audit.js');
  assert.match(audit, /const AUDIT_ENDPOINT = '\/api\/audit\/event'/);
  assert.match(audit, /export function trackAuditEvent/);
  const studio = read('src/pages/Studio.jsx');
  assert.match(studio, /trackAuditEvent\('page_view'\)/);
  assert.match(studio, /trackAuditEvent\('image_upload'/);
  const editor = read('src/components/studio/EditorPanel.jsx');
  assert.match(editor, /trackAuditEvent\('export_png'/);
  for (const rel of [
    'api/audit/event.js',
    'api/audit/summary.js',
    'server/audit-utils.js',
    'shared/audit.js',
    'shared/audit-event.js',
    'workers/audit/index.js',
    'workers/audit/storage.js',
    'workers/audit/wrangler.jsonc',
  ]) {
    assert.equal(existsSync(join(root, rel)), true, `${rel} must remain until a later removal PR`);
  }
});

test('package.json depends on @vercel/analytics and keeps audit tests', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(typeof pkg.dependencies['@vercel/analytics'], 'string');
  assert.match(pkg.scripts['test:audit'], /tests\/audit/);
  assert.match(pkg.scripts['test:analytics'], /tests\/analytics/);
});

test('production build includes the WA script path and keeps the audit beacon', (t) => {
  const distAssets = join(root, 'dist/assets');
  if (!existsSync(distAssets)) {
    t.skip('dist/ not built yet');
    return;
  }
  const bundles = readdirSync(distAssets).filter((name) => name.endsWith('.js'));
  assert.ok(bundles.length > 0, 'expected hashed JS assets in dist/assets');
  const combined = bundles.map((name) => read(`dist/assets/${name}`)).join('\n');
  assert.match(combined, /_vercel\/insights/);
  assert.match(combined, /\/api\/audit\/event/);
});
