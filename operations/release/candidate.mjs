import fs from 'node:fs';
import path from 'node:path';

import {
  assembleCompatibilityManifest,
  verifyComponentDirectory,
} from '../../contracts/artifacts/lib/validation.mjs';
import { canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import { writeImmutableFile } from '../lib/immutable-output.mjs';
import {
  requireCanonicalPath,
  resolveContainedPath,
} from '../lib/path-policy.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';
import { createRunRoot } from '../lib/run-root.mjs';
import {
  APPLICATION_VERSION,
  ARCHIVE_COMPATIBILITY_MATRIX_DIGEST,
  ARCHIVE_MANIFEST_SCHEMA_DIGEST,
  ARCHIVE_SCHEMA_SQL_DIGEST,
  COMMON_COMMIT,
  COMPONENTS,
  FROZEN_PRODUCT,
  OPENAPI_DIGEST,
  SOURCE_EPOCH_RANGE,
  TARGET,
} from './constants.mjs';
import {
  compareTrees,
  completeInventoryDocument,
  copyImmutableFile,
  copyImmutableTree,
  descriptorForFile,
  inventoryTree,
  serializeChecksumInventory,
  writeCanonicalFile,
} from './files.mjs';
import { inspectOciArchive } from './oci.mjs';
import { cleanupOwnedRunRoot } from './owned-cleanup.mjs';
import { readAcceptedDevelopment } from './receipt.mjs';
import {
  extractGzipTarMember,
  writePrefixedTar,
} from './tar.mjs';

const VALIDATION_SCHEMA = readJsonStrict(
  new URL('../schemas/release-validation-candidate-v1.schema.json', import.meta.url),
);
const TAG_SCHEMA = readJsonStrict(
  new URL('../schemas/release-tag-candidate-v1.schema.json', import.meta.url),
);
const INVENTORY_SCHEMA = readJsonStrict(
  new URL('../schemas/release-complete-inventory-v1.schema.json', import.meta.url),
);
const validateValidationCandidate = compileStrictSchema(VALIDATION_SCHEMA, {
  label: 'validation candidate schema',
});
const validateTagCandidate = compileStrictSchema(TAG_SCHEMA, {
  label: 'tag release candidate schema',
});
const validateCompleteInventory = compileStrictSchema(INVENTORY_SCHEMA, {
  label: 'complete candidate inventory schema',
});

export class ReleaseCandidateError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseCandidateError';
  }
}

function fail(message, cause) {
  throw new ReleaseCandidateError(message, cause ? { cause } : undefined);
}

function ensureOutputRoot(outputRoot) {
  const requested = path.resolve(outputRoot);
  fs.mkdirSync(requested, { mode: 0o700, recursive: true });
  return requireCanonicalPath(requested, {
    label: 'release output root',
    type: 'directory',
  });
}

function sourceArtifact(componentRoot, statement, expectedPath) {
  const record = statement.artifacts.find((entry) => entry.path === expectedPath);
  if (!record) fail(`${statement.component} lacks ${expectedPath}`);
  const source = resolveContainedPath(componentRoot, record.path, {
    allowMissing: false,
    label: `${statement.component} artifact ${record.path}`,
  });
  const actual = descriptorForFile(componentRoot, record.path);
  if (actual.sha256 !== record.sha256 || actual.size !== record.size) {
    fail(`${statement.component} artifact drifted: ${record.path}`);
  }
  return { record, source };
}

function assertComponentStatement(statement, component, source) {
  if (
    statement.component !== component ||
    statement.applicationVersion !== APPLICATION_VERSION ||
    statement.target.os !== TARGET.os ||
    statement.target.architecture !== TARGET.architecture ||
    statement.source.revision !== source.revision ||
    statement.source.tree !== source.tree
  ) {
    fail(`${component} statement differs from the admitted source and target`);
  }
}

function componentRecord(candidateRoot, component, statement) {
  const root = `components/${component}`;
  const inventory = inventoryTree(path.join(candidateRoot, 'components', component));
  return deepFreeze({
    artifactSetDigest: statement.artifactSetDigest,
    root,
    statement: descriptorForFile(candidateRoot, `${root}/component-statement.json`),
    treeDigest: canonicalJsonDigest(inventory),
  });
}

function compatibilityRecord(assembly) {
  const archive = assembly.manifest.compatibility.archive;
  if (
    archive.compatibilityMatrixDigest !== ARCHIVE_COMPATIBILITY_MATRIX_DIGEST ||
    archive.manifestSchemaDigest !== ARCHIVE_MANIFEST_SCHEMA_DIGEST ||
    archive.schemaSqlDigest !== ARCHIVE_SCHEMA_SQL_DIGEST ||
    assembly.manifest.compatibility.openapiDigest !== OPENAPI_DIGEST
  ) {
    fail('assembled compatibility manifest differs from fixed Contracts authority');
  }
  return deepFreeze({
    archive: {
      castRulesVersion: archive.castRulesVersion,
      commonCommit: COMMON_COMMIT,
      compatibilityMatrixDigest: archive.compatibilityMatrixDigest,
      domainRulesVersion: archive.domainRulesVersion,
      manifestSchemaDigest: archive.manifestSchemaDigest,
      schemaSqlDigest: archive.schemaSqlDigest,
    },
    openapiDigest: assembly.manifest.compatibility.openapiDigest,
  });
}

function publishCandidate({
  candidateRoot,
  completeInventory,
  outputRoot,
  run,
  runTmpRoot,
}) {
  const addressName = completeInventory.contentAddress.replace('sha256:', 'sha256-');
  const publishedParent = path.join(outputRoot, 'published');
  fs.mkdirSync(publishedParent, { mode: 0o700, recursive: true });
  requireCanonicalPath(publishedParent, {
    below: outputRoot,
    label: 'published candidates root',
    type: 'directory',
  });
  const destination = path.join(publishedParent, addressName);
  if (fs.existsSync(destination)) {
    compareTrees(candidateRoot, destination, 'existing candidate and rebuilt candidate');
  } else {
    fs.renameSync(candidateRoot, destination);
  }
  cleanupOwnedRunRoot(run.runRoot, {
    expectedPurpose: 'candidate-assembly',
    tmpRoot: runTmpRoot,
  });
  const inventoryParent = path.join(outputRoot, 'inventories');
  fs.mkdirSync(inventoryParent, { mode: 0o700, recursive: true });
  const inventoryRelative = `${addressName}.json`;
  const inventoryPath = path.join(inventoryParent, inventoryRelative);
  if (fs.existsSync(inventoryPath)) {
    const existing = parseAndValidateCanonicalJson(
      fs.readFileSync(inventoryPath, 'utf8'),
      validateCompleteInventory,
      {
        label: 'existing complete inventory',
        policy: assertEvidenceSafe,
      },
    );
    if (canonicalJsonDigest(existing) !== canonicalJsonDigest(completeInventory)) {
      fail('existing complete inventory differs at the same content address');
    }
  } else {
    writeCanonicalFile({
      relativePath: inventoryRelative,
      root: inventoryParent,
      value: completeInventory,
    });
  }
  return deepFreeze({
    candidateRoot: requireCanonicalPath(destination, {
      below: publishedParent,
      label: 'published candidate',
      type: 'directory',
    }),
    completeInventory,
    completeInventoryPath: requireCanonicalPath(inventoryPath, {
      below: inventoryParent,
      label: 'published complete inventory',
      type: 'file',
    }),
  });
}

export async function assembleReleaseCandidate({
  candidateKind,
  componentRoots,
  execution,
  outputRoot,
  releaseTag,
  source,
  sourceEpoch,
  sourceController,
  toolchain,
}) {
  if (!['tag-release', 'validation'].includes(candidateKind)) {
    throw new TypeError('candidate kind must be validation or tag-release');
  }
  if (
    !Number.isSafeInteger(sourceEpoch) ||
    sourceEpoch < SOURCE_EPOCH_RANGE.minimum ||
    sourceEpoch > SOURCE_EPOCH_RANGE.maximum
  ) {
    throw new TypeError('candidate source epoch is outside the admitted range');
  }
  const output = ensureOutputRoot(outputRoot);
  const runTmpRoot = path.join(output, '.candidate-runs');
  const run = createRunRoot({
    directories: ['candidate'],
    purpose: 'candidate-assembly',
    tmpRoot: runTmpRoot,
  });
  const candidateRoot = path.join(run.runRoot, 'candidate');
  try {
    const roots = {};
    const verified = {};
    for (const component of COMPONENTS) {
      const root = requireCanonicalPath(componentRoots[component], {
        label: `${component} component root`,
        type: 'directory',
      });
      roots[component] = root;
      verified[component] = verifyComponentDirectory(root, component);
      assertComponentStatement(verified[component].statement, component, source);
    }
    const assembly = assembleCompatibilityManifest(
      COMPONENTS.map((component) => roots[component]),
    );
    const receipt = readAcceptedDevelopment();
    copyImmutableFile({
      destinationRelative: 'accepted-development.json',
      destinationRoot: candidateRoot,
      mode: 0o444,
      source: receipt.path,
    });
    for (const component of COMPONENTS) {
      copyImmutableTree({
        destinationRoot: candidateRoot,
        prefix: `components/${component}`,
        sourceRoot: roots[component],
      });
    }

    fs.mkdirSync(path.join(candidateRoot, 'release'), { mode: 0o700 });
    const backendStatement = verified.backend.statement;
    const frontendStatement = verified.frontend.statement;
    const updaterStatement = verified.updater.statement;
    const backendImage = sourceArtifact(
      roots.backend,
      backendStatement,
      'artifacts/backend-api-linux-amd64.oci.tar',
    );
    const backendBundle = sourceArtifact(
      roots.backend,
      backendStatement,
      'artifacts/backend-api-linux-amd64.tar.gz',
    );
    const frontendTar = sourceArtifact(
      roots.frontend,
      frontendStatement,
      'artifacts/frontend-static-linux-amd64.tar',
    );
    const updaterImage = sourceArtifact(
      roots.updater,
      updaterStatement,
      'artifacts/updater-image-linux-amd64.oci.tar',
    );
    copyImmutableFile({
      destinationRelative: 'release/backend-api-linux-amd64.oci.tar',
      destinationRoot: candidateRoot,
      mode: 0o444,
      source: backendImage.source,
    });
    copyImmutableFile({
      destinationRelative: 'release/updater-image-linux-amd64.oci.tar',
      destinationRoot: candidateRoot,
      mode: 0o444,
      source: updaterImage.source,
    });
    writePrefixedTar({
      archivePath: path.join(
        candidateRoot,
        'release',
        'frontend-static-linux-amd64.tar',
      ),
      prefix: 'frontend',
      sourceArchive: frontendTar.source,
    });
    await extractGzipTarMember({
      allowedDirectories: ['bin', 'metadata'],
      archivePath: backendBundle.source,
      destinationPath: path.join(candidateRoot, 'release', 'archive-smoke'),
      expectedMtime: 0,
      memberPath: 'bin/archive-smoke',
      mode: 0o555,
    });
    writeCanonicalFile({
      relativePath: 'release/compatibility-manifest.json',
      root: candidateRoot,
      value: assembly.manifest,
    });
    for (const component of COMPONENTS) {
      const statement = verified[component].statement;
      copyImmutableFile({
        destinationRelative: `release/${component}-component-statement.json`,
        destinationRoot: candidateRoot,
        mode: 0o444,
        source: path.join(roots[component], 'component-statement.json'),
      });
      copyImmutableFile({
        destinationRelative: `release/${component}.spdx.json`,
        destinationRoot: candidateRoot,
        mode: 0o444,
        source: resolveContainedPath(roots[component], statement.sbom.path, {
          allowMissing: false,
          label: `${component} SPDX source`,
        }),
      });
    }

    const backendLoadReference =
      `localhost/bgmss-backend-api:${source.revision}-amd64`;
    const updaterLoadReference =
      `localhost/bgmss-updater-artifact:${source.revision}-amd64`;
    const apiGraph = inspectOciArchive({
      archivePath: path.join(
        candidateRoot,
        'release',
        'backend-api-linux-amd64.oci.tar',
      ),
      declaredLoadReference: backendLoadReference,
      expectedMtime: 0,
    });
    const updaterGraph = inspectOciArchive({
      archivePath: path.join(
        candidateRoot,
        'release',
        'updater-image-linux-amd64.oci.tar',
      ),
      declaredLoadReference: updaterLoadReference,
      expectedMtime: sourceEpoch,
    });
    const compatibility = compatibilityRecord(assembly);
    const records = inventoryTree(candidateRoot, {
      exclude: ['payload-checksums.sha256'],
    });
    const checksumSource = serializeChecksumInventory(records);
    const checksumEvidence = writeCanonicalChecksum(
      candidateRoot,
      checksumSource,
    );
    const common = {
      applicationVersion: APPLICATION_VERSION,
      assets: {
        archiveSmoke: descriptorForFile(candidateRoot, 'release/archive-smoke'),
        compatibilityManifest: descriptorForFile(
          candidateRoot,
          'release/compatibility-manifest.json',
        ),
        frontend: descriptorForFile(
          candidateRoot,
          'release/frontend-static-linux-amd64.tar',
        ),
      },
      compatibility,
      components: Object.fromEntries(
        COMPONENTS.map((component) => [
          component,
          componentRecord(
            candidateRoot,
            component,
            verified[component].statement,
          ),
        ]),
      ),
      images: {
        api: {
          archive: descriptorForFile(
            candidateRoot,
            'release/backend-api-linux-amd64.oci.tar',
          ),
          declaredLoadReference: backendLoadReference,
          ...apiGraph,
        },
        updater: {
          archive: descriptorForFile(
            candidateRoot,
            'release/updater-image-linux-amd64.oci.tar',
          ),
          declaredLoadReference: updaterLoadReference,
          ...updaterGraph,
        },
      },
      payloadChecksums: {
        ...checksumEvidence,
        fileCount: records.length,
      },
      receipt: descriptorForFile(candidateRoot, 'accepted-development.json'),
      sourceEpoch,
      target: TARGET,
      toolchain,
    };
    let candidateDocument;
    let candidatePath;
    if (candidateKind === 'validation') {
      if (
        source.revision !== FROZEN_PRODUCT.revision ||
        source.tree !== FROZEN_PRODUCT.tree
      ) {
        fail('validation candidate must build the frozen product identity');
      }
      candidatePath = 'validation-candidate-v1.json';
      candidateDocument = {
        ...common,
        execution,
        publicationState: 'unpublished-validation',
        schemaVersion: 'operations-validation-candidate-v1',
        source: {
          operationsController: sourceController,
          product: source,
        },
      };
      validateValidationCandidate(candidateDocument);
    } else {
      if (releaseTag !== APPLICATION_VERSION) {
        fail('tag release must equal the application VERSION');
      }
      candidatePath = 'tag-release-candidate-v1.json';
      candidateDocument = {
        ...common,
        publicationState: 'unpublished-tag-release',
        releaseTag,
        schemaVersion: 'operations-tag-release-candidate-v1',
        source: {
          frozenBaseline: FROZEN_PRODUCT,
          operationsController: sourceController,
          release: source,
        },
      };
      validateTagCandidate(candidateDocument);
    }
    assertEvidenceSafe(candidateDocument, { label: 'release candidate' });
    writeCanonicalFile({
      relativePath: candidatePath,
      root: candidateRoot,
      value: candidateDocument,
    });
    const completeInventory = completeInventoryDocument({
      candidateDocument: candidatePath,
      candidateKind,
      candidateRoot,
    });
    validateCompleteInventory(completeInventory);
    return publishCandidate({
      candidateRoot,
      completeInventory,
      outputRoot: output,
      run,
      runTmpRoot,
    });
  } catch (error) {
    let cleanupError;
    if (fs.existsSync(run.runRoot)) {
      try {
        cleanupOwnedRunRoot(run.runRoot, {
          expectedPurpose: 'candidate-assembly',
          tmpRoot: runTmpRoot,
        });
      } catch (failure) {
        cleanupError = failure;
      }
    }
    if (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'release candidate assembly and owned cleanup both failed',
      );
    }
    if (error instanceof ReleaseCandidateError) throw error;
    fail('release candidate assembly failed', error);
  }
}

function writeCanonicalChecksum(root, source) {
  writeImmutableFile({
    bytes: source,
    mode: 0o444,
    relativePath: 'payload-checksums.sha256',
    root,
  });
  return descriptorForFile(root, 'payload-checksums.sha256');
}

export function candidateSchemas() {
  return deepFreeze({
    completeInventory: INVENTORY_SCHEMA,
    tagRelease: TAG_SCHEMA,
    validation: VALIDATION_SCHEMA,
  });
}
