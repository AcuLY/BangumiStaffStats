#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../..");
const decoder = new TextDecoder("utf-8", { fatal: true });
const domainPrefix = Buffer.from("bgmss.query.v1\0", "ascii");
const statusOrder = ["completed", "in_progress", "on_hold", "dropped"];
const exactAuthorities = [
  {
    id: "archive-schema-v1",
    path: "contracts/schemas/archive/schema.sql",
    sha256: "3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0",
  },
  {
    id: "catalog-complete-derivation",
    path: "contracts/goldens/catalog/cases/complete-derivation.json",
    sha256: "bd9ba99c3643ef70d58dc9168e2e12f6c88c460390c42777ea0ea6b76e76f23f",
  },
  {
    id: "catalog-index-v1",
    path: "contracts/goldens/catalog/index.json",
    sha256: "306ec088acc3f0e0fce61fbbfcb0a5f21be64c9672efe5c60e356f06fa5422a2",
  },
  {
    id: "catalog-selection-rule-verifier",
    path: "contracts/schemas/catalog/tooling/verify.mjs",
    sha256: "3540a1e886c0498a6df2020ff2637404a0d3cb3554ffab4f983d038a3fd881dc",
  },
  {
    id: "catalog-synthetic-staff-set-v1",
    path: "contracts/goldens/catalog/config/staff-sets-synthetic-v1.json",
    sha256: "38377e0572238a1aba089b441ed7aa67e2599e0ada7e4e3422cb002f8d5c60a1",
  },
  {
    id: "effective-query-schema-v1",
    path: "contracts/schemas/query/effective-query-v1.schema.json",
    sha256: "6c2e8e35992daa69426ce69e599041c51ff311497d2b3294379895f4f9e3c045",
  },
  {
    id: "shared-query-cases-v1",
    path: "contracts/goldens/query/cases/queries.json",
    sha256: "f65ba796d072ae9a0b47d98f8572dfa92787066e3a9dadbe09ff9adbf5741d50",
  },
  {
    id: "shared-query-manifest-v1",
    path: "contracts/goldens/query/manifest.json",
    sha256: "07de454928afc6e36b2abcf65eb17f4b9e8cffccb27b99504dd04a5244d9ab31",
  },
  {
    id: "shared-query-schema-v1",
    path: "contracts/schemas/query/shared-query-v1.schema.json",
    sha256: "df7c96cd7df800703ae9478dedcf6b372fb25f26739e5f542ce592bfd23c0362",
  },
];
const exactRequiredCoverage = [
  "bounded-442-not-449",
  "cast-all",
  "cast-main",
  "collection-isolation",
  "collection-status",
  "context-cancellation",
  "defined-position-no-credit",
  "deterministic-order",
  "exact-staff",
  "global-no-collection-access",
  "global-score-min-max",
  "identity-work-union",
  "missing-global-score",
  "missing-personal-score",
  "multi-position-person-and",
  "nsfw-false",
  "nsfw-true",
  "official-staff-101-not-cast",
  "participant-person-intersection",
  "personal-score-min-max",
  "public-meta-personal-tags",
  "rating-count-min-max",
  "repeated-run",
  "scope-global",
  "scope-personal",
  "score-difference-min-max",
  "shuffled-facts",
  "staff-set-evidence",
  "subject-date-min-max",
  "tag-exclude-or-and",
  "tag-include-and-or",
];
const exactCaseIds = [
  "actual-participation-442-not-candidate-449",
  "cancellation-publishes-no-partial-result",
  "cast-main-official-staff-and-no-credit",
  "global-filter-matrix-no-collection-access",
  "multi-position-person-and-work-union",
  "personal-filter-inclusive-boundaries",
  "personal-normalized-complete-filter-matrix",
  "shuffled-and-repeated-input-is-deterministic",
];
const exactFileKinds = new Map([
  ["cases/control.json", "control-and-determinism"],
  ["cases/identity-algebra.json", "identity-set-algebra"],
  ["cases/oracle-provenance.json", "bounded-oracle-provenance"],
  ["cases/scope-filters.json", "scope-filter-matrix"],
  ["fixtures/anime-domain-v1.json", "synthetic-archive-catalog-collection"],
]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertObject(value, context) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${context}: object`);
}

function exactKeys(value, allowed, context) {
  assertObject(value, context);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(unknown.length === 0, `${context}: unknown fields ${unknown.sort().join(",")}`);
}

function readJson(absolutePath) {
  let text;
  try {
    text = decoder.decode(readFileSync(absolutePath));
  } catch (error) {
    fail(`${path.relative(repositoryRoot, absolutePath)}: invalid UTF-8: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${path.relative(repositoryRoot, absolutePath)}: invalid JSON: ${error.message}`);
  }
}

function canonical(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    assert(Number.isFinite(value), "canonical JSON contains a non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  assert(value && typeof value === "object", "unsupported canonical JSON value");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function deepEqual(actual, expected, context) {
  const actualBytes = canonical(actual);
  const expectedBytes = canonical(expected);
  if (actualBytes !== expectedBytes) {
    fail(`${context}: mismatch\nexpected ${expectedBytes}\nactual   ${actualBytes}`);
  }
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function trimV1(value) {
  return value.replace(
    /^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu,
    "",
  );
}

function normalizeText(value) {
  return trimV1(value).normalize("NFKC").toLowerCase().replaceAll("ß", "ss");
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeInline(submitted) {
  exactKeys(
    submitted,
    submitted?.scope === "personal"
      ? [
          "scope",
          "uid",
          "collectionStatuses",
          "subjectType",
          "positionKeys",
          "includeNSFW",
          "mergeSeries",
          "filters",
        ]
      : [
          "scope",
          "subjectType",
          "positionKeys",
          "includeNSFW",
          "mergeSeries",
          "filters",
        ],
    "inline query",
  );
  assert(submitted.scope === "global" || submitted.scope === "personal", "inline scope");
  const effective = {
    scope: submitted.scope,
  };
  if (submitted.scope === "personal") {
    assert(typeof submitted.uid === "string", "personal uid");
    effective.uid = trimV1(submitted.uid);
    effective.collectionStatuses = statusOrder.filter((status) =>
      new Set(submitted.collectionStatuses).has(status),
    );
  }
  effective.subjectType = submitted.subjectType;
  effective.positionKeys = unique(submitted.positionKeys);
  effective.includeNSFW = submitted.includeNSFW ?? false;
  effective.mergeSeries = submitted.mergeSeries ?? false;
  if (submitted.filters !== undefined) {
    exactKeys(
      submitted.filters,
      submitted.scope === "personal"
        ? [
            "subjectDate",
            "collectionUpdatedAt",
            "personalScore",
            "globalScore",
            "scoreDifference",
            "ratingCount",
            "tags",
          ]
        : ["subjectDate", "globalScore", "ratingCount", "tags"],
      "inline filters",
    );
    for (const key of [
      "subjectDate",
      "collectionUpdatedAt",
      "personalScore",
      "globalScore",
      "scoreDifference",
      "ratingCount",
    ]) {
      if (submitted.filters[key] !== undefined) {
        exactKeys(submitted.filters[key], ["min", "max"], `inline filters.${key}`);
      }
    }
    if (submitted.filters.tags !== undefined) {
      exactKeys(submitted.filters.tags, ["include", "exclude"], "inline filters.tags");
      for (const group of submitted.filters.tags.include ?? []) {
        exactKeys(group, ["anyOf"], "inline include group");
      }
      for (const group of submitted.filters.tags.exclude ?? []) {
        exactKeys(group, ["allOf"], "inline exclude group");
      }
    }
    effective.filters = structuredClone(submitted.filters);
    const tags = effective.filters.tags;
    if (tags?.include) {
      tags.include = tags.include.map((group) => ({
        anyOf: unique(group.anyOf.map(normalizeText)),
      }));
    }
    if (tags?.exclude) {
      tags.exclude = tags.exclude.map((group) => ({
        allOf: unique(group.allOf.map(normalizeText)),
      }));
    }
  }
  const projection = structuredClone(effective);
  delete projection.uid;
  const queryDigest = `q1:${sha256(Buffer.concat([domainPrefix, Buffer.from(canonical(projection))]))}`;
  return { effective, queryDigest };
}

function resolveQuery(caseValue, queryVectors) {
  const source = caseValue.querySource;
  assert(source && typeof source === "object", `${caseValue.caseId}: querySource`);
  if (source.kind === "inline") {
    exactKeys(source, ["kind", "submitted"], `${caseValue.caseId}: inline source`);
    return normalizeInline(source.submitted);
  }
  assert(source.kind === "sharedQueryVector", `${caseValue.caseId}: querySource kind`);
  exactKeys(source, ["kind", "path", "caseId"], `${caseValue.caseId}: vector source`);
  assert(
    source.path === "contracts/goldens/query/cases/queries.json",
    `${caseValue.caseId}: query authority path`,
  );
  const vector = queryVectors.get(source.caseId);
  assert(vector, `${caseValue.caseId}: unknown query vector ${source.caseId}`);
  return {
    effective: structuredClone(vector.expected.effective),
    queryDigest: vector.expected.queryDigest,
  };
}

function isValidScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10;
}

function inRange(value, range) {
  return (range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max);
}

function subjectTags(subject, collectionEntry) {
  const tags = subject.tags.map((tag) => {
    exactKeys(tag, ["scope", "name"], `subject ${subject.subjectId}: typed tag`);
    assert(tag.scope === "public" || tag.scope === "meta", `subject ${subject.subjectId}: tag scope`);
    assert(typeof tag.name === "string" && tag.name.length > 0, `subject ${subject.subjectId}: tag`);
    return normalizeText(tag.name);
  });
  if (collectionEntry) tags.push(...collectionEntry.tags.map(normalizeText));
  return new Set(tags);
}

function tagsPass(tags, filter) {
  if (filter?.include) {
    for (const group of filter.include) {
      if (!group.anyOf.some((token) => tags.has(token))) return false;
    }
  }
  if (filter?.exclude) {
    for (const group of filter.exclude) {
      if (group.allOf.every((token) => tags.has(token))) return false;
    }
  }
  return true;
}

function eligibleSubjects(effective, fixture, domain, control) {
  let collectionAccessCount = 0;
  let collectionBySubject = new Map();
  if (effective.scope === "personal") {
    collectionAccessCount += 1;
    const collection = fixture.collections.find((value) => value.uid === effective.uid);
    assert(collection, `collection ${effective.uid}`);
    collectionBySubject = new Map(collection.entries.map((entry) => [entry.subjectId, entry]));
  }
  const filters = effective.filters ?? {};
  const eligible = [];
  let scanned = 0;
  for (const subject of domain.subjects) {
    scanned += 1;
    if (
      control?.cancelAfter?.phase === "archive-subject-scan" &&
      scanned >= control.cancelAfter.records
    ) {
      const error = new Error("canceled");
      error.code = "CONTEXT_CANCELED";
      throw error;
    }
    if (subject.subjectType !== effective.subjectType) continue;
    if (!effective.includeNSFW && subject.nsfw) continue;
    const collectionEntry = collectionBySubject.get(subject.subjectId);
    if (effective.scope === "personal") {
      if (!collectionEntry || !effective.collectionStatuses.includes(collectionEntry.status)) continue;
    }
    if (filters.subjectDate) {
      if (
        !subject.airDate ||
        !Number.isInteger(subject.airDatePrecision) ||
        subject.airDatePrecision < 2
      ) continue;
      if (!inRange(subject.airDate.slice(0, 7), filters.subjectDate)) continue;
    }
    if (filters.collectionUpdatedAt) {
      if (!collectionEntry || !inRange(collectionEntry.updatedAt, filters.collectionUpdatedAt)) {
        continue;
      }
    }
    if (filters.personalScore) {
      if (
        !collectionEntry ||
        !isValidScore(collectionEntry.personalScore) ||
        !inRange(collectionEntry.personalScore, filters.personalScore)
      ) continue;
    }
    if (filters.globalScore) {
      if (!isValidScore(subject.globalScore) || !inRange(subject.globalScore, filters.globalScore)) {
        continue;
      }
    }
    if (filters.scoreDifference) {
      if (!collectionEntry || !isValidScore(collectionEntry.personalScore) ||
          !isValidScore(subject.globalScore)) continue;
      if (!inRange(collectionEntry.personalScore - subject.globalScore, filters.scoreDifference)) {
        continue;
      }
    }
    if (filters.ratingCount) {
      const count = subject.ratingBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
      if (!Number.isSafeInteger(count) || !inRange(count, filters.ratingCount)) continue;
    }
    if (!tagsPass(subjectTags(subject, collectionEntry), filters.tags)) continue;
    eligible.push(subject.subjectId);
  }
  eligible.sort((left, right) => left - right);
  return { eligible, collectionAccessCount };
}

function contributionOrder(left, right) {
  return left.subjectId - right.subjectId ||
    left.personId - right.personId ||
    (left.positionId ?? 0) - (right.positionId ?? 0) ||
    (left.characterId ?? 0) - (right.characterId ?? 0) ||
    (left.roleType ?? 0) - (right.roleType ?? 0) ||
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
    (left.memberPositionKey ?? "").localeCompare(right.memberPositionKey ?? "");
}

function positionResult(positionKey, eligibleSet, fixture, domain, planCache = new Map()) {
  const cacheKey = `${positionKey}\0${[...eligibleSet].sort((a, b) => a - b).join(",")}`;
  if (planCache.has(cacheKey)) return structuredClone(planCache.get(cacheKey));
  const plan = fixture.catalogPlans.find((value) => value.positionKey === positionKey);
  assert(plan, `unknown catalog plan ${positionKey}`);
  const contributions = [];
  if (plan.ruleKind === "exactStaff") {
    for (const credit of domain.staffCredits) {
      if (eligibleSet.has(credit.subjectId) && credit.positionId === plan.positionId) {
        contributions.push({
          positionKey,
          kind: "staff",
          subjectId: credit.subjectId,
          personId: credit.personId,
          positionId: credit.positionId,
        });
      }
    }
  } else if (plan.ruleKind === "exactCast") {
    const roles = new Set(plan.roleTypes);
    for (const credit of domain.castCredits) {
      if (eligibleSet.has(credit.subjectId) && roles.has(credit.roleType)) {
        contributions.push({
          positionKey,
          kind: "cast",
          subjectId: credit.subjectId,
          personId: credit.personId,
          characterId: credit.characterId,
          roleType: credit.roleType,
          sortOrder: credit.sortOrder,
        });
      }
    }
  } else {
    assert(plan.ruleKind === "staffSetUnion", `catalog rule ${plan.ruleKind}`);
    for (const memberPositionKey of plan.memberPositionKeys) {
      const member = positionResult(memberPositionKey, eligibleSet, fixture, domain, planCache);
      for (const contribution of member.contributions) {
        contributions.push({
          ...contribution,
          positionKey,
          memberPositionKey,
        });
      }
    }
  }
  contributions.sort(contributionOrder);
  const result = {
    positionKey,
    candidatePersonIds: unique(contributions.map((value) => value.personId)).sort((a, b) => a - b),
    candidateSubjectIds: unique(contributions.map((value) => value.subjectId)).sort((a, b) => a - b),
    contributions,
  };
  planCache.set(cacheKey, structuredClone(result));
  return result;
}

function intersection(sets) {
  if (sets.length === 0) return [];
  return [...sets[0]].filter((value) => sets.slice(1).every((set) => set.has(value)))
    .sort((a, b) => a - b);
}

function evaluateSuccess(caseValue, query, fixture, domain) {
  const { eligible, collectionAccessCount } = eligibleSubjects(
    query.effective,
    fixture,
    domain,
    undefined,
  );
  const eligibleSet = new Set(eligible);
  const planCache = new Map();
  const positionResults = query.effective.positionKeys.map((positionKey) =>
    positionResult(positionKey, eligibleSet, fixture, domain, planCache)
  );
  const rankingPersonIds = intersection(
    positionResults.map((result) => new Set(result.candidatePersonIds)),
  );
  const rankingPeople = rankingPersonIds.map((personId) => ({
    personId,
    subjectIds: unique(
      positionResults.flatMap((result) =>
        result.contributions
          .filter((contribution) => contribution.personId === personId)
          .map((contribution) => contribution.subjectId)
      ),
    ).sort((a, b) => a - b),
  }));
  const participatingSubjectIds = unique(
    rankingPeople.flatMap((person) => person.subjectIds),
  ).sort((a, b) => a - b);
  const participantSets = (caseValue.participantRequests ?? []).map((request) => {
    const personSets = request.people.map((person) => {
      const ids = person.positionKeys.flatMap((positionKey) =>
        positionResult(positionKey, eligibleSet, fixture, domain, planCache).contributions
          .filter((contribution) => contribution.personId === person.personId)
          .map((contribution) => contribution.subjectId)
      );
      return new Set(ids);
    });
    return {
      requestId: request.requestId,
      subjectIds: intersection(personSets),
    };
  });
  return {
    effectiveQuery: query.effective,
    queryDigest: query.queryDigest,
    collectionAccessCount,
    eligibleSubjectIds: eligible,
    positionResults,
    rankingPeople,
    participatingSubjectIds,
    participantSets,
  };
}

function reorderedDomain(domain, order) {
  const result = structuredClone(domain);
  for (const key of ["people", "subjects", "staffCredits", "castCredits"]) {
    if (order === "reverse") result[key].reverse();
    if (order === "rotate-one" && result[key].length > 0) {
      result[key].push(result[key].shift());
    }
  }
  return result;
}

function validateFixture(fixture, catalogAuthority) {
  exactKeys(
    fixture,
    [
      "fixtureVersion",
      "fixtureId",
      "subjectType",
      "catalogPlans",
      "domains",
      "collections",
    ],
    "fixture",
  );
  assert(fixture.fixtureVersion === 1 && fixture.fixtureId === "anime-domain-v1", "fixture identity");
  assert(fixture.subjectType === "anime", "fixture subject type");
  const expectedPlans = [
    {
      positionKey: "staff:anime:2",
      ruleKind: "exactStaff",
      positionId: 2,
    },
    {
      positionKey: "staff:anime:67",
      ruleKind: "exactStaff",
      positionId: 67,
    },
    {
      positionKey: "staff:anime:74",
      ruleKind: "exactStaff",
      positionId: 74,
    },
    {
      positionKey: "staff:anime:101",
      ruleKind: "exactStaff",
      positionId: 101,
    },
    {
      positionKey: "cast:anime:main",
      ruleKind: "exactCast",
      roleTypes: [1],
    },
    {
      positionKey: "cast:anime:all",
      ruleKind: "exactCast",
      roleTypes: [1, 2, 3, 4, 5, 6],
    },
    {
      positionKey: "staffset:anime:director-family",
      ruleKind: "staffSetUnion",
      memberPositionKeys: ["staff:anime:2", "staff:anime:74"],
    },
  ];
  deepEqual(fixture.catalogPlans, expectedPlans, "fixture catalog plans");
  const commonAnime = catalogAuthority.input.commonCatalog.find(
    (entry) => entry.subjectType === "anime",
  );
  const commonPositionIds = new Set(commonAnime.positions.map((position) => position.id));
  const syntheticStaffSets = readJson(
    path.join(repositoryRoot, "contracts/goldens/catalog/config/staff-sets-synthetic-v1.json"),
  );
  const catalogVerifier = decoder.decode(
    readFileSync(path.join(repositoryRoot, "contracts/schemas/catalog/tooling/verify.mjs")),
  );
  assert(
    catalogVerifier.includes(
      'selectionRule: scope === "main" ? "roleType=1" : "roleType=1..6"',
    ),
    "accepted cast selection rule authority",
  );
  assert(
    catalogVerifier.includes("selectionRule: `positionId=${commonPosition.id}`"),
    "accepted staff selection rule authority",
  );
  assert(
    catalogVerifier.includes("selectionRule: `staffSetUnion:${staffSet.key}`"),
    "accepted staff-set selection rule authority",
  );
  for (const plan of fixture.catalogPlans) {
    exactKeys(
      plan,
      plan.ruleKind === "exactStaff"
        ? ["positionKey", "ruleKind", "positionId"]
        : plan.ruleKind === "exactCast"
          ? ["positionKey", "ruleKind", "roleTypes"]
          : ["positionKey", "ruleKind", "memberPositionKeys"],
      `catalog plan ${plan.positionKey}`,
    );
    if (plan.ruleKind === "exactStaff") {
      assert(
        commonPositionIds.has(plan.positionId),
        `catalog plan ${plan.positionKey}: unknown common position`,
      );
      assert(
        plan.positionKey === `staff:anime:${plan.positionId}`,
        `catalog plan ${plan.positionKey}: exact staff identity`,
      );
    } else if (plan.ruleKind === "exactCast") {
      assert(
        plan.positionKey === "cast:anime:main" || plan.positionKey === "cast:anime:all",
        `catalog plan ${plan.positionKey}: cast identity`,
      );
      assert(
        plan.roleTypes.every((role) => Number.isInteger(role) && role >= 1 && role <= 6),
        `catalog plan ${plan.positionKey}: cast roles`,
      );
    } else {
      const accepted = syntheticStaffSets.sets.find((set) => set.key === plan.positionKey);
      assert(accepted, `catalog plan ${plan.positionKey}: staff set authority`);
      deepEqual(plan.memberPositionKeys, accepted.members.slice().sort(), `${plan.positionKey}: members`);
    }
  }
  exactKeys(fixture.domains, ["filters", "identity"], "fixture domains");
  for (const [domainName, domain] of Object.entries(fixture.domains)) {
    exactKeys(domain, ["people", "subjects", "staffCredits", "castCredits"], domainName);
    for (const person of domain.people) {
      exactKeys(person, ["personId"], `${domainName}: person`);
      assert(Number.isSafeInteger(person.personId) && person.personId > 0, `${domainName}: person ID`);
    }
    const subjectIds = new Set();
    const personIds = new Set(domain.people.map((person) => person.personId));
    assert(personIds.size === domain.people.length, `${domainName}: duplicate people`);
    for (const subject of domain.subjects) {
      exactKeys(
        subject,
        [
          "subjectId",
          "subjectType",
          "nsfw",
          "airDate",
          "airDatePrecision",
          "globalScore",
          "ratingBuckets",
          "tags",
        ],
        `${domainName}: subject`,
      );
      assert(!subjectIds.has(subject.subjectId), `${domainName}: duplicate subject`);
      subjectIds.add(subject.subjectId);
      subjectTags(subject, undefined);
      for (const bucket of subject.ratingBuckets) {
        exactKeys(bucket, ["rating", "count"], `${domainName}: rating bucket`);
        assert(
          Number.isInteger(bucket.rating) &&
            bucket.rating >= 1 &&
            bucket.rating <= 10 &&
            Number.isSafeInteger(bucket.count) &&
            bucket.count >= 0,
          `${domainName}: rating bucket value`,
        );
      }
      assert(
        subject.airDatePrecision === null ||
          [1, 2, 3].includes(subject.airDatePrecision),
        `${domainName}: date precision`,
      );
    }
    for (const credit of domain.staffCredits) {
      exactKeys(
        credit,
        ["subjectId", "personId", "positionId"],
        `${domainName}: staff credit`,
      );
      assert(subjectIds.has(credit.subjectId), `${domainName}: staff subject closure`);
      assert(personIds.has(credit.personId), `${domainName}: staff person closure`);
    }
    for (const credit of domain.castCredits) {
      exactKeys(
        credit,
        ["subjectId", "personId", "characterId", "roleType", "sortOrder"],
        `${domainName}: cast credit`,
      );
      assert(subjectIds.has(credit.subjectId), `${domainName}: cast subject closure`);
      assert(personIds.has(credit.personId), `${domainName}: cast person closure`);
      assert(credit.roleType >= 1 && credit.roleType <= 6, `${domainName}: cast role`);
    }
  }
  const filterSubjects = new Set(fixture.domains.filters.subjects.map((value) => value.subjectId));
  for (const collection of fixture.collections) {
    exactKeys(collection, ["uid", "entries"], "collection");
    for (const entry of collection.entries) {
      exactKeys(
        entry,
        ["subjectId", "status", "personalScore", "updatedAt", "tags"],
        `${collection.uid}: collection entry`,
      );
      assert(entry.tags.every((tag) => typeof tag === "string"), `${collection.uid}: tags`);
      assert(filterSubjects.has(entry.subjectId), `${collection.uid}: collection subject closure`);
    }
  }
  const archiveSchema = decoder.decode(
    readFileSync(path.join(repositoryRoot, "contracts/schemas/archive/schema.sql")),
  );
  for (const fragment of [
    "CREATE TABLE subject (",
    "nsfw INTEGER NOT NULL",
    "air_date_precision INTEGER",
    "CREATE TABLE subject_rating_bucket (",
    "CREATE TABLE subject_tag (",
    "tag_scope TEXT NOT NULL",
    "CREATE TABLE staff_credit (",
    "CREATE TABLE cast_credit (",
    "role_type INTEGER NOT NULL CHECK (role_type BETWEEN 1 AND 6)",
    "CREATE TABLE staff_set_member (",
    "CREATE TABLE catalog_selection_rule (",
  ]) {
    assert(archiveSchema.includes(fragment), `Archive authority fragment ${fragment}`);
  }
}

function expandRange(range) {
  assert(
    Array.isArray(range.inclusiveRange) &&
      range.inclusiveRange.length === 2 &&
      range.inclusiveRange.every(Number.isSafeInteger),
    "inclusive range",
  );
  const [minimum, maximum] = range.inclusiveRange;
  assert(minimum > 0 && maximum >= minimum && maximum - minimum <= 1000, "bounded range");
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
}

function verifyOracle(caseValue, query) {
  deepEqual(
    caseValue.syntheticFacts,
    {
      eligibleSubjectIds: {
        inclusiveRange: [1, 449],
      },
      staffContribution: {
        positionKey: "staff:anime:2",
        positionId: 2,
        personId: 44901,
        subjectIds: {
          inclusiveRange: [1, 442],
        },
      },
    },
    `${caseValue.caseId}: synthetic facts`,
  );
  const eligible = expandRange(caseValue.syntheticFacts.eligibleSubjectIds);
  const participating = expandRange(caseValue.syntheticFacts.staffContribution.subjectIds);
  const participatingSet = new Set(participating);
  deepEqual(
    caseValue.expected,
    {
      effectiveQuery: query.effective,
      queryDigest: query.queryDigest,
      eligibleSubjectIds: {
        inclusiveRange: [1, 449],
        count: eligible.length,
      },
      candidatePersonIds: [44901],
      candidateSubjectIds: {
        inclusiveRange: [1, 442],
        count: participating.length,
      },
      rankingPeople: [
        {
          personId: 44901,
          subjectIds: {
            inclusiveRange: [1, 442],
            count: participating.length,
          },
        },
      ],
      participatingSubjectIds: {
        inclusiveRange: [1, 442],
        count: participating.length,
      },
      nonParticipatingEligibleSubjectIds: eligible.filter(
        (subjectId) => !participatingSet.has(subjectId),
      ),
    },
    `${caseValue.caseId}: expected`,
  );
  deepEqual(
    caseValue.oracleProvenance,
    {
      commit: "644b7748674e553f863d0ffd61d029f86fdc0717",
      paths: [
        "frontend/public/workbench-data/co-star-snapshot.json",
        "frontend/src/workbench/composables/useWorkbench.ts",
      ],
      observedCandidateCount: 449,
      actualParticipatingCount: 442,
      classification: "INTENTIONAL_DELTA",
      decision: "COUNT-001",
      bulkFixtureCopied: false,
    },
    `${caseValue.caseId}: provenance`,
  );
}

function listRegularFiles(root, prefix = "") {
  const result = [];
  for (const name of readdirSync(root).sort()) {
    const absolute = path.join(root, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    const metadata = lstatSync(absolute);
    assert(!metadata.isSymbolicLink(), `${relative}: symlink forbidden`);
    if (metadata.isDirectory()) result.push(...listRegularFiles(absolute, relative));
    else {
      assert(metadata.isFile(), `${relative}: regular file required`);
      result.push(relative);
    }
  }
  return result;
}

function validateCaseShape(relative, document, caseValue) {
  exactKeys(
    document,
    relative === "cases/oracle-provenance.json"
      ? ["caseFileVersion", "kind", "cases"]
      : ["caseFileVersion", "kind", "fixture", "cases"],
    `${relative}: root`,
  );
  if (relative !== "cases/oracle-provenance.json") {
    assert(document.fixture === "fixtures/anime-domain-v1.json", `${relative}: fixture`);
  }
  assert(
    Array.isArray(caseValue.coverage) &&
      caseValue.coverage.length > 0 &&
      caseValue.coverage.every((value) => typeof value === "string") &&
      new Set(caseValue.coverage).size === caseValue.coverage.length,
    `${caseValue.caseId}: coverage`,
  );
  if (relative === "cases/oracle-provenance.json") {
    exactKeys(
      caseValue,
      [
        "caseId",
        "outcome",
        "coverage",
        "querySource",
        "syntheticFacts",
        "expected",
        "oracleProvenance",
      ],
      caseValue.caseId,
    );
    exactKeys(
      caseValue.syntheticFacts,
      ["eligibleSubjectIds", "staffContribution"],
      `${caseValue.caseId}: facts`,
    );
    exactKeys(
      caseValue.syntheticFacts.staffContribution,
      ["positionKey", "positionId", "personId", "subjectIds"],
      `${caseValue.caseId}: contribution`,
    );
    exactKeys(caseValue.syntheticFacts.eligibleSubjectIds, ["inclusiveRange"], "oracle eligible");
    exactKeys(caseValue.syntheticFacts.staffContribution.subjectIds, ["inclusiveRange"], "oracle subjects");
    exactKeys(
      caseValue.oracleProvenance,
      [
        "commit",
        "paths",
        "observedCandidateCount",
        "actualParticipatingCount",
        "classification",
        "decision",
        "bulkFixtureCopied",
      ],
      `${caseValue.caseId}: provenance`,
    );
    return;
  }
  if (caseValue.outcome === "success") {
    exactKeys(
      caseValue,
      [
        "caseId",
        "outcome",
        "coverage",
        "domain",
        "querySource",
        "participantRequests",
        "expected",
      ],
      caseValue.caseId,
    );
    for (const request of caseValue.participantRequests ?? []) {
      exactKeys(request, ["requestId", "people"], `${caseValue.caseId}: participant request`);
      for (const person of request.people) {
        exactKeys(
          person,
          ["personId", "positionKeys"],
          `${caseValue.caseId}: participant person`,
        );
      }
    }
    return;
  }
  if (caseValue.outcome === "successReference") {
    exactKeys(
      caseValue,
      [
        "caseId",
        "outcome",
        "coverage",
        "domain",
        "querySource",
        "factOrders",
        "repeatCount",
        "expectedSameAs",
      ],
      caseValue.caseId,
    );
    exactKeys(caseValue.expectedSameAs, ["path", "caseId"], `${caseValue.caseId}: reference`);
    return;
  }
  assert(caseValue.outcome === "failure", `${caseValue.caseId}: outcome`);
  exactKeys(
    caseValue,
    [
      "caseId",
      "outcome",
      "coverage",
      "domain",
      "querySource",
      "evaluationControl",
      "expectedFailure",
    ],
    caseValue.caseId,
  );
  exactKeys(caseValue.evaluationControl, ["cancelAfter"], `${caseValue.caseId}: control`);
  exactKeys(
    caseValue.evaluationControl.cancelAfter,
    ["phase", "records"],
    `${caseValue.caseId}: cancel`,
  );
  exactKeys(
    caseValue.expectedFailure,
    ["kind", "cause", "partialResult", "writesObserved"],
    `${caseValue.caseId}: failure`,
  );
}

const casePaths = [
  "cases/control.json",
  "cases/identity-algebra.json",
  "cases/oracle-provenance.json",
  "cases/scope-filters.json",
];
const caseFiles = new Map(
  casePaths.map((relative) => [relative, readJson(path.join(goldenRoot, relative))]),
);
const allCases = new Map();
for (const [relative, document] of caseFiles) {
  assert(document.caseFileVersion === 1 && Array.isArray(document.cases), `${relative}: shape`);
  for (const caseValue of document.cases) {
    validateCaseShape(relative, document, caseValue);
    assert(!allCases.has(caseValue.caseId), `${caseValue.caseId}: duplicate case`);
    allCases.set(caseValue.caseId, { ...caseValue, sourcePath: relative });
  }
}
const queryDocument = readJson(
  path.join(repositoryRoot, "contracts/goldens/query/cases/queries.json"),
);
const queryVectors = new Map(queryDocument.cases.map((caseValue) => [caseValue.id, caseValue]));

if (process.argv.includes("--print-digests")) {
  for (const [caseId, caseValue] of [...allCases].sort()) {
    if (caseValue.querySource) {
      console.log(`${caseId} ${resolveQuery(caseValue, queryVectors).queryDigest}`);
    }
  }
  process.exit(0);
}

const manifest = readJson(path.join(goldenRoot, "manifest.json"));
exactKeys(
  manifest,
  [
    "schemaVersion",
    "contract",
    "algorithm",
    "authorities",
    "files",
    "verifier",
    "caseIds",
    "requiredCoverage",
    "oracleProvenance",
  ],
  "manifest",
);
assert(manifest.schemaVersion === 1, "manifest schema version");
assert(manifest.contract === "contracts-query-domain/v1", "manifest contract");
assert(manifest.algorithm === "bgmss-query-domain-golden-index-v1", "manifest algorithm");
deepEqual(manifest.authorities, exactAuthorities, "manifest authorities");
deepEqual(manifest.requiredCoverage, exactRequiredCoverage, "manifest required coverage");
deepEqual(manifest.caseIds, exactCaseIds, "manifest exact case IDs");
deepEqual(
  manifest.oracleProvenance,
  {
    commit: "644b7748674e553f863d0ffd61d029f86fdc0717",
    candidateCount: 449,
    actualParticipatingCount: 442,
    bulkFixtureCopied: false,
  },
  "manifest oracle provenance",
);
exactKeys(manifest.verifier, ["path", "runtime", "dependencies", "sha256"], "verifier entry");
deepEqual(
  {
    path: manifest.verifier.path,
    runtime: manifest.verifier.runtime,
    dependencies: manifest.verifier.dependencies,
  },
  {
    path: "verify.mjs",
    runtime: "node",
    dependencies: [],
  },
  "verifier identity",
);
const declaredFiles = manifest.files.map((entry) => entry.path);
assert(
  canonical(declaredFiles) === canonical(declaredFiles.slice().sort()),
  "manifest files must be lexically sorted",
);
deepEqual(declaredFiles, [...exactFileKinds.keys()], "manifest exact file paths");
for (const entry of manifest.files) {
  exactKeys(entry, ["path", "kind", "sha256"], `manifest file ${entry.path}`);
  assert(entry.kind === exactFileKinds.get(entry.path), `${entry.path}: kind`);
}
const expectedInventory = ["manifest.json", "verify.mjs", ...declaredFiles].sort();
deepEqual(listRegularFiles(goldenRoot), expectedInventory, "closed inventory");
for (const entry of manifest.files) {
  const data = readFileSync(path.join(goldenRoot, entry.path));
  assert(sha256(data) === entry.sha256, `${entry.path}: hash`);
}
assert(
  sha256(readFileSync(path.join(goldenRoot, "verify.mjs"))) === manifest.verifier.sha256,
  "verifier hash",
);
for (const authority of manifest.authorities) {
  const data = readFileSync(path.join(repositoryRoot, authority.path));
  assert(sha256(data) === authority.sha256, `${authority.id}: authority hash`);
}

const fixture = readJson(path.join(goldenRoot, "fixtures/anime-domain-v1.json"));
const catalogAuthority = readJson(
  path.join(repositoryRoot, "contracts/goldens/catalog/cases/complete-derivation.json"),
);
validateFixture(fixture, catalogAuthority);

const successes = [];
for (const [caseId, caseValue] of allCases) {
  const query = resolveQuery(caseValue, queryVectors);
  for (const positionKey of query.effective.positionKeys) {
    assert(
      fixture.catalogPlans.some((plan) => plan.positionKey === positionKey),
      `${caseId}: query position closure`,
    );
  }
  if (caseValue.sourcePath === "cases/oracle-provenance.json") {
    verifyOracle(caseValue, query);
    successes.push(caseId);
    continue;
  }
  const domain = fixture.domains[caseValue.domain];
  assert(domain, `${caseId}: domain`);
  if (caseValue.outcome === "failure") {
    let observed;
    try {
      eligibleSubjects(query.effective, fixture, domain, caseValue.evaluationControl);
    } catch (error) {
      observed = error;
    }
    assert(observed?.code === "CONTEXT_CANCELED", `${caseId}: cancellation`);
    deepEqual(
      caseValue.expectedFailure,
      {
        kind: "context",
        cause: "canceled",
        partialResult: false,
        writesObserved: 0,
      },
      `${caseId}: failure`,
    );
    continue;
  }
  if (caseValue.outcome === "successReference") {
    const reference = allCases.get(caseValue.expectedSameAs.caseId);
    assert(
      reference && reference.sourcePath === caseValue.expectedSameAs.path,
      `${caseId}: result reference`,
    );
    const referenceQuery = resolveQuery(reference, queryVectors);
    for (const order of caseValue.factOrders) {
      for (let run = 0; run < caseValue.repeatCount; run += 1) {
        const actual = evaluateSuccess(
          reference,
          referenceQuery,
          fixture,
          reorderedDomain(domain, order),
        );
        deepEqual(actual, reference.expected, `${caseId}: ${order} run ${run + 1}`);
      }
    }
    successes.push(caseId);
    continue;
  }
  const actual = evaluateSuccess(caseValue, query, fixture, domain);
  deepEqual(actual, caseValue.expected, caseId);
  successes.push(caseId);
}

const declaredCaseIds = manifest.caseIds;
deepEqual(
  declaredCaseIds,
  [...allCases.keys()].sort(),
  "manifest case IDs",
);
const observedCoverage = new Set(
  [...allCases.values()].flatMap((caseValue) => caseValue.coverage ?? []),
);
for (const requirement of manifest.requiredCoverage) {
  assert(observedCoverage.has(requirement), `missing coverage ${requirement}`);
}

console.log(
  JSON.stringify({
    ok: true,
    contract: manifest.contract,
    files: expectedInventory.length,
    cases: allCases.size,
    successes: successes.length,
    failures: allCases.size - successes.length,
    authorities: manifest.authorities.length,
  }),
);
