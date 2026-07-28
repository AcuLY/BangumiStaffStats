import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const BUILD_SOURCE = fs.readFileSync(
  new URL('../../release/build-amd64.mjs', import.meta.url),
  'utf8',
);
const CANDIDATE_SOURCE = fs.readFileSync(
  new URL('../../release/candidate.mjs', import.meta.url),
  'utf8',
);
const VERIFY_CANDIDATE_SOURCE = fs.readFileSync(
  new URL('../../release/verify-candidate-lib.mjs', import.meta.url),
  'utf8',
);

test('AMD64 build caches avoid uv hard links and isolate the Go module cache', () => {
  assert.match(BUILD_SOURCE, /UV_LINK_MODE: 'copy'/u);
  assert.match(BUILD_SOURCE, /GOFLAGS: '-modcacherw'/u);
  assert.match(
    BUILD_SOURCE,
    /GOMODCACHE: path\.join\(setRoot, 'go-mod-cache'\)/u,
  );
});

test('parallel component failures settle before builder and run-root cleanup', () => {
  assert.match(
    BUILD_SOURCE,
    /Promise\.allSettled\(\[\s*backendPromise,\s*frontendPromise,\s*\]\)/u,
  );
  assert.doesNotMatch(
    BUILD_SOURCE,
    /Promise\.all\(\[\s*backendPromise,\s*frontendPromise,\s*\]\)/u,
  );
});

test('candidate assembly admits only producer-owned tar directories and mtimes', () => {
  assert.match(
    CANDIDATE_SOURCE,
    /allowedDirectories: \['bin', 'metadata'\]/u,
  );
  assert.match(
    CANDIDATE_SOURCE,
    /declaredLoadReference: updaterLoadReference,\s*expectedMtime: sourceEpoch/u,
  );
  assert.match(
    CANDIDATE_SOURCE,
    /receipt: descriptorForFile\([^)]*\),\s*sourceEpoch,\s*target: TARGET/us,
  );
  assert.match(
    VERIFY_CANDIDATE_SOURCE,
    /'release\/backend-api-linux-amd64\.oci\.tar',\s*backendLoadReference,\s*0,/u,
  );
  assert.match(
    VERIFY_CANDIDATE_SOURCE,
    /'release\/updater-image-linux-amd64\.oci\.tar',\s*updaterLoadReference,\s*candidate\.sourceEpoch,/u,
  );
});
