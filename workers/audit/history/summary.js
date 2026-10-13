// Read access only. No import/admin endpoint is added to the public Worker.
export const VERIFIED_HISTORY = `state = 'verified' AND verified_at IS NOT NULL
  AND json_extract(receipt_json, '$.manifestSha256') = manifest_sha256
  AND json_extract(receipt_json, '$.canonicalSha256') = canonical_sha256
  AND json_extract(receipt_json, '$.backupSha256') = backup_sha256
  AND json_extract(receipt_json, '$.rowCount') = expected_rows`;

export function historyCoverage(imports) {
  const verified = imports.find(item => item.eligible);
  if (!verified) {
    return {
      status: imports.length ? 'unverified' : 'not_imported',
      states: [...new Set(imports.map(item => item.state))].sort(),
      usage: 'unknown', includedInTotals: false,
    };
  }
  const manifest = JSON.parse(verified.manifest_json);
  return {
    status: 'verified_snapshot', includedInTotals: true,
    sourceProject: verified.source_project, importId: verified.import_id,
    snapshotAt: manifest.snapshotAt, sourceScope: manifest.scope,
    importedRows: verified.expected_rows,
    firstRecordedAt: verified.first_source_at, lastRecordedAt: verified.last_source_at,
    legacyEndExclusive: verified.legacy_end_exclusive,
    verifiedAt: verified.verified_at,
    backupSha256: verified.backup_sha256, canonicalSha256: verified.canonical_sha256,
    usage: 'known_for_verified_snapshot_only',
    note: 'Verified against the supplied source snapshot; no claim of events before its first record or during the gap to live collection. Source deletion requires separate approval.',
  };
}
