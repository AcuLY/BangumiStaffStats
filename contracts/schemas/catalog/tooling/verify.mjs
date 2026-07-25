import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_ROOT = path.resolve(TOOL_DIR, "..");
const GOLDEN_ROOT = path.resolve(SCHEMA_ROOT, "../../goldens/catalog");
const SUBJECT_TYPES = ["book", "anime", "music", "game", "real"];
const CAST_TYPES = new Set(["anime", "game"]);
const CAPABILITIES = [
  "rankings",
  "candidates",
  "personDetail",
  "partners",
  "coStar",
];
const SCHEMA_FILES = [
  "display-config.schema.json",
  "staff-set-config.schema.json",
  "derivation-case.schema.json",
  "quality-report.schema.json",
  "golden-index.schema.json",
];
const EXPECTED_FEATURED = {
  anime: [
    "staff:anime:2",
    "staff:anime:67",
    "cast:anime:main",
    "cast:anime:all",
    "staff:anime:3",
    "staff:anime:10",
    "staff:anime:74",
    "staff:anime:1",
    "staff:anime:5",
    "staff:anime:4",
  ],
  game: [
    "staff:game:1004",
    "staff:game:1001",
    "cast:game:all",
    "cast:game:main",
    "staff:game:1013",
  ],
};
const EXPECTED_CAST_GROUPS = {
  anime: {
    anchorCategoryKey: "music",
    positionKeys: ["cast:anime:main", "cast:anime:all"],
  },
  game: {
    anchorCategoryKey: "music",
    positionKeys: ["cast:game:main", "cast:game:all"],
  },
};
const EXPECTED_MUTATIONS = [
  "synthetic-staff-set",
  "synthetic-staff-set-members-reordered",
  "staff-set-label-changed",
  "missing-featured-position",
  "duplicate-featured-position",
  "cross-type-staff-set-member",
  "cast-staff-set-member",
  "unknown-staff-set-member",
  "missing-cast-anchor",
  "missing-chinese-label",
  "unknown-cast-role",
  "official-position-credit-only",
  "missing-category-chinese-label",
  "phantom-person-cast-edge",
  "phantom-character-cast-edge",
  "conflicting-subject-character",
  "duplicate-subject-character",
  "duplicate-person-character",
  "duplicate-staff-credit",
  "additional-staff-set-group-collision",
  "cast-anchor-label-drift",
];

const decoder = new TextDecoder("utf-8", { fatal: true });

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

function projectionDigest(projection) {
  return projection === null
    ? null
    : `sha256:${sha256Text(`${JSON.stringify(projection)}\n`)}`;
}

async function readUtf8(filePath) {
  const bytes = await readFile(filePath);
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new Error(`fatal UTF-8 decode failed for ${filePath}: ${error.message}`);
  }
}

async function readJson(filePath) {
  const text = await readUtf8(filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`strict JSON parse failed for ${filePath}: ${error.message}`);
  }
}

async function walkRegularFiles(root) {
  const result = [];
  async function visit(current, relative) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const stat = await lstat(absolute);
      assert.equal(stat.isSymbolicLink(), false, `symlink is forbidden: ${rel}`);
      if (stat.isDirectory()) {
        await visit(absolute, rel);
      } else {
        assert.equal(stat.isFile(), true, `non-regular golden is forbidden: ${rel}`);
        result.push(rel);
      }
    }
  }
  await visit(root, "");
  return result;
}

function clone(value) {
  return structuredClone(value);
}

function normalizedNames(names) {
  return {
    cn: names.cn === "" ? null : names.cn,
    en: names.en === "" ? null : names.en,
    jp: names.jp === "" ? null : names.jp,
  };
}

function stableOrdered(items, idSelector) {
  return [...items].sort((left, right) => {
    const leftPositive = Number.isInteger(left.order) && left.order > 0;
    const rightPositive = Number.isInteger(right.order) && right.order > 0;
    if (leftPositive !== rightPositive) {
      return leftPositive ? -1 : 1;
    }
    if (leftPositive && left.order !== right.order) {
      return left.order - right.order;
    }
    if (left.sourceIndex !== right.sourceIndex) {
      return left.sourceIndex - right.sourceIndex;
    }
    const leftId = idSelector(left);
    const rightId = idSelector(right);
    return typeof leftId === "number"
      ? leftId - rightId
      : Buffer.from(leftId).compare(Buffer.from(rightId));
  });
}

function compareAscii(left, right) {
  return Buffer.from(left).compare(Buffer.from(right));
}

function uniqueErrors(errors) {
  return [...new Set(errors)].sort(compareAscii);
}

function configSemanticErrors(displayConfig) {
  const errors = [];
  const ruleKeys = displayConfig.capabilityRules.map(
    (rule) => `${rule.subjectType}:${rule.positionKind}`,
  );
  const expectedRuleKeys = [
    "book:staff",
    "anime:staff",
    "music:staff",
    "game:staff",
    "real:staff",
    "anime:cast",
    "game:cast",
  ];
  if (
    new Set(ruleKeys).size !== ruleKeys.length ||
    expectedRuleKeys.some((key) => !ruleKeys.includes(key))
  ) {
    errors.push("CAPABILITY_MATRIX_INVALID");
  }
  for (const rule of displayConfig.capabilityRules) {
    if (
      rule.capabilities.length !== CAPABILITIES.length ||
      CAPABILITIES.some((value, index) => rule.capabilities[index] !== value)
    ) {
      errors.push("CAPABILITY_MATRIX_INVALID");
    }
  }

  const featuredTypes = displayConfig.featuredGroups.map((group) => group.subjectType);
  if (
    new Set(featuredTypes).size !== featuredTypes.length ||
    featuredTypes.length !== 2
  ) {
    errors.push("FEATURED_GROUP_INVALID");
  }
  for (const [subjectType, expectedKeys] of Object.entries(EXPECTED_FEATURED)) {
    const group = displayConfig.featuredGroups.find(
      (candidate) => candidate.subjectType === subjectType,
    );
    if (
      !group ||
      group.positionKeys.length !== expectedKeys.length ||
      expectedKeys.some((key, index) => group.positionKeys[index] !== key)
    ) {
      errors.push("FEATURED_GROUP_INVALID");
    }
  }

  const castTypes = displayConfig.castGroups.map((group) => group.subjectType);
  if (new Set(castTypes).size !== castTypes.length || castTypes.length !== 2) {
    errors.push("CAST_GROUP_INVALID");
  }
  for (const [subjectType, expected] of Object.entries(EXPECTED_CAST_GROUPS)) {
    const group = displayConfig.castGroups.find(
      (candidate) => candidate.subjectType === subjectType,
    );
    if (
      !group ||
      group.anchorCategoryKey !== expected.anchorCategoryKey ||
      group.positionKeys.length !== expected.positionKeys.length ||
      expected.positionKeys.some(
        (key, index) => group.positionKeys[index] !== key,
      )
    ) {
      errors.push("CAST_GROUP_INVALID");
    }
  }

  const additionalKeys = displayConfig.additionalDisplayGroups.map(
    (group) => group.groupKey,
  );
  if (new Set(additionalKeys).size !== additionalKeys.length) {
    errors.push("DUPLICATE_GROUP_KEY");
  }
  return uniqueErrors(errors);
}

function canonicalizeConfig(displayConfig, staffSetConfig) {
  const sortedSets = [...staffSetConfig.sets]
    .map((set) => ({
      key: set.key,
      subjectType: set.subjectType,
      label: set.label,
      displayOrder: set.displayOrder,
      members: [...set.members].sort(compareAscii),
    }))
    .sort((left, right) => {
      const typeDifference =
        SUBJECT_TYPES.indexOf(left.subjectType) - SUBJECT_TYPES.indexOf(right.subjectType);
      if (typeDifference !== 0) {
        return typeDifference;
      }
      if (left.displayOrder !== right.displayOrder) {
        return left.displayOrder - right.displayOrder;
      }
      return compareAscii(left.key, right.key);
    });
  const canonical = {
    display: {
      schemaVersion: displayConfig.schemaVersion,
      capabilityRules: displayConfig.capabilityRules.map((rule) => ({
        subjectType: rule.subjectType,
        positionKind: rule.positionKind,
        capabilities: [...rule.capabilities],
      })),
      featuredGroups: displayConfig.featuredGroups.map((group) => ({
        subjectType: group.subjectType,
        label: group.label,
        positionKeys: [...group.positionKeys],
      })),
      castGroups: displayConfig.castGroups.map((group) => ({
        subjectType: group.subjectType,
        label: group.label,
        anchorCategoryKey: group.anchorCategoryKey,
        positionKeys: [...group.positionKeys],
      })),
      additionalDisplayGroups: displayConfig.additionalDisplayGroups.map((group) => ({
        groupKey: group.groupKey,
        subjectType: group.subjectType,
        label: group.label,
        displayOrder: group.displayOrder,
        positionKeys: [...group.positionKeys],
      })),
    },
    staffSets: {
      schemaVersion: staffSetConfig.schemaVersion,
      sets: sortedSets,
    },
  };
  const bytesUtf8 = `${JSON.stringify(canonical)}\n`;
  return {
    bytesUtf8,
    digest: `sha256:${sha256Text(bytesUtf8)}`,
  };
}

function subjectTypeFromPositionKey(positionKey) {
  return positionKey.split(":")[1] ?? null;
}

function buildQualityReport(input, commonPositionIds, exactJoinedEdges, validCv) {
  const eligibleSubjects = input.archive.subjects.filter((subject) =>
    CAST_TYPES.has(subject.subjectType),
  );
  const subjectTypeById = new Map(
    input.archive.subjects.map((subject) => [subject.subjectId, subject.subjectType]),
  );
  const charactersBySubject = new Map();
  for (const row of input.archive.subjectCharacters) {
    const values = charactersBySubject.get(row.subjectId) ?? new Set();
    values.add(row.characterId);
    charactersBySubject.set(row.subjectId, values);
  }
  const joinedBySubject = new Map();
  for (const edge of exactJoinedEdges) {
    const values = joinedBySubject.get(edge.subjectId) ?? [];
    values.push(edge);
    joinedBySubject.set(edge.subjectId, values);
  }

  const noCharacters = eligibleSubjects
    .filter((subject) => (charactersBySubject.get(subject.subjectId)?.size ?? 0) === 0)
    .map((subject) => ({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
    }))
    .sort(sampleSubjectComparator);
  const noCastRelations = eligibleSubjects
    .filter((subject) => (joinedBySubject.get(subject.subjectId)?.length ?? 0) === 0)
    .map((subject) => ({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
    }))
    .sort(sampleSubjectComparator);
  const filtered = exactJoinedEdges
    .filter((edge) => !validCv.has(edge.personId))
    .map((edge) => ({
      subjectType: subjectTypeById.get(edge.subjectId),
      subjectId: edge.subjectId,
      characterId: edge.characterId,
      personId: edge.personId,
      roleType: edge.roleType,
    }))
    .sort(edgeComparator);

  const roleCounts = new Map();
  for (const edge of input.archive.subjectCharacters) {
    roleCounts.set(edge.type, (roleCounts.get(edge.type) ?? 0) + 1);
  }
  const unknownCounts = new Map();
  for (const credit of input.archive.staffCredits) {
    const subjectType = subjectTypeById.get(credit.subjectId);
    if (!subjectType) {
      continue;
    }
    if (!commonPositionIds.get(subjectType)?.has(credit.positionId)) {
      const key = `${subjectType}:${credit.positionId}`;
      unknownCounts.set(key, (unknownCounts.get(key) ?? 0) + 1);
    }
  }
  return {
    schemaVersion: 1,
    counts: {
      NO_CHARACTERS: noCharacters.length,
      NO_CAST_RELATIONS: noCastRelations.length,
      FILTERED_BY_VALID_CV: filtered.length,
    },
    samples: {
      NO_CHARACTERS: noCharacters.slice(0, 100),
      NO_CAST_RELATIONS: noCastRelations.slice(0, 100),
      FILTERED_BY_VALID_CV: filtered.slice(0, 100),
    },
    roleInventory: [...roleCounts]
      .sort((left, right) => left[0] - right[0])
      .map(([roleType, count]) => ({ roleType, count })),
    unknownStaffPositionIds: [...unknownCounts]
      .map(([key, count]) => {
        const [subjectType, positionId] = key.split(":");
        return { subjectType, positionId: Number(positionId), count };
      })
      .sort((left, right) => {
        const typeDifference =
          SUBJECT_TYPES.indexOf(left.subjectType) -
          SUBJECT_TYPES.indexOf(right.subjectType);
        return typeDifference || left.positionId - right.positionId;
      }),
    blockingErrors: [],
  };
}

function sampleSubjectComparator(left, right) {
  return (
    SUBJECT_TYPES.indexOf(left.subjectType) -
      SUBJECT_TYPES.indexOf(right.subjectType) ||
    left.subjectId - right.subjectId
  );
}

function edgeComparator(left, right) {
  return (
    SUBJECT_TYPES.indexOf(left.subjectType) -
      SUBJECT_TYPES.indexOf(right.subjectType) ||
    left.subjectId - right.subjectId ||
    left.characterId - right.characterId ||
    left.personId - right.personId ||
    left.roleType - right.roleType ||
    (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0)
  );
}

function deriveCase(input, validators) {
  const errors = [];
  if (!validators.display(input.displayConfig)) {
    errors.push("DISPLAY_CONFIG_SCHEMA_INVALID");
  }
  if (!validators.staffSet(input.staffSetConfig)) {
    errors.push("STAFF_SET_CONFIG_SCHEMA_INVALID");
  }
  if (errors.length === 0) {
    errors.push(...configSemanticErrors(input.displayConfig));
  }

  const commonByType = new Map();
  if (
    input.commonCatalog.length !== SUBJECT_TYPES.length ||
    new Set(input.commonCatalog.map((entry) => entry.subjectType)).size !==
      SUBJECT_TYPES.length ||
    SUBJECT_TYPES.some(
      (subjectType) =>
        !input.commonCatalog.some((entry) => entry.subjectType === subjectType),
    )
  ) {
    errors.push("COMMON_TYPE_SET_INVALID");
  }

  const positions = [];
  const positionByKey = new Map();
  const commonPositionIds = new Map();
  const categoryGroupsByType = new Map();
  for (const subjectType of SUBJECT_TYPES) {
    const catalog = input.commonCatalog.find(
      (entry) => entry.subjectType === subjectType,
    );
    if (!catalog) {
      continue;
    }
    commonByType.set(subjectType, catalog);
    const categoryKeys = catalog.categories.map((category) => category.key);
    if (new Set(categoryKeys).size !== categoryKeys.length) {
      errors.push("DUPLICATE_COMMON_CATEGORY");
    }
    for (const category of catalog.categories) {
      if (normalizedNames(category.names).cn === null) {
        errors.push("COMMON_CATEGORY_CHINESE_LABEL_MISSING");
      }
    }
    const positionIds = catalog.positions.map((position) => position.id);
    if (new Set(positionIds).size !== positionIds.length) {
      errors.push("DUPLICATE_COMMON_POSITION");
    }
    commonPositionIds.set(subjectType, new Set(positionIds));
    for (const position of catalog.positions) {
      if (
        position.categoryKeys.some((categoryKey) => !categoryKeys.includes(categoryKey))
      ) {
        errors.push("UNKNOWN_COMMON_CATEGORY_REFERENCE");
      }
    }
    const capabilityRule = input.displayConfig.capabilityRules.find(
      (rule) =>
        rule.subjectType === subjectType && rule.positionKind === "staff",
    );
    for (const [index, commonPosition] of stableOrdered(
      catalog.positions,
      (position) => position.id,
    ).entries()) {
      const names = normalizedNames(commonPosition.names);
      if (names.cn === null) {
        errors.push("COMMON_CHINESE_LABEL_MISSING");
      }
      const positionKey = `staff:${subjectType}:${commonPosition.id}`;
      const position = {
        positionKey,
        subjectType,
        positionKind: "staff",
        names,
        displayOrder: (index + 1) * 10,
        selectable: true,
        capabilities: capabilityRule ? [...capabilityRule.capabilities] : [],
        selectionRule: `positionId=${commonPosition.id}`,
        exclusiveRule: null,
      };
      positions.push(position);
      positionByKey.set(positionKey, position);
    }
    categoryGroupsByType.set(
      subjectType,
      stableOrdered(catalog.categories, (category) => category.key),
    );
  }

  for (const subjectType of ["anime", "game"]) {
    const capabilityRule = input.displayConfig.capabilityRules.find(
      (rule) =>
        rule.subjectType === subjectType && rule.positionKind === "cast",
    );
    const existingCount = positions.filter(
      (position) => position.subjectType === subjectType,
    ).length;
    for (const [offset, scope] of ["main", "all"].entries()) {
      const positionKey = `cast:${subjectType}:${scope}`;
      const position = {
        positionKey,
        subjectType,
        positionKind: "cast",
        names: {
          cn: scope === "main" ? "声优（仅主役）" : "声优",
          en: null,
          jp: null,
        },
        displayOrder: (existingCount + offset + 1) * 10,
        selectable: true,
        capabilities: capabilityRule ? [...capabilityRule.capabilities] : [],
        selectionRule: scope === "main" ? "roleType=1" : "roleType=1..6",
        exclusiveRule: `exclusive:cast:${subjectType}`,
      };
      positions.push(position);
      positionByKey.set(positionKey, position);
    }
  }

  const setKeySet = new Set();
  const staffSets = [];
  for (const staffSet of input.staffSetConfig.sets) {
    if (setKeySet.has(staffSet.key)) {
      errors.push("DUPLICATE_STAFF_SET_KEY");
    }
    setKeySet.add(staffSet.key);
    if (subjectTypeFromPositionKey(staffSet.key) !== staffSet.subjectType) {
      errors.push("STAFF_SET_TYPE_MISMATCH");
    }
    if (new Set(staffSet.members).size !== staffSet.members.length) {
      errors.push("DUPLICATE_STAFF_SET_MEMBER");
    }
    const members = [];
    for (const memberKey of staffSet.members) {
      const member = positionByKey.get(memberKey);
      if (!member) {
        errors.push("UNKNOWN_STAFF_SET_MEMBER");
        continue;
      }
      if (member.positionKind !== "staff") {
        errors.push("NON_STAFF_SET_MEMBER");
      }
      if (member.subjectType !== staffSet.subjectType) {
        errors.push("CROSS_TYPE_STAFF_SET_MEMBER");
      }
      members.push(member);
    }
    if (members.length !== staffSet.members.length) {
      continue;
    }
    const capabilities = CAPABILITIES.filter((capability) =>
      members.every((member) => member.capabilities.includes(capability)),
    );
    const sortedMembers = [...staffSet.members].sort(compareAscii);
    staffSets.push({
      key: staffSet.key,
      members: sortedMembers,
      capabilities,
    });
    const position = {
      positionKey: staffSet.key,
      subjectType: staffSet.subjectType,
      positionKind: "staffSet",
      names: { cn: staffSet.label, en: null, jp: null },
      displayOrder: staffSet.displayOrder,
      selectable: true,
      capabilities,
      selectionRule: `staffSetUnion:${staffSet.key}`,
      exclusiveRule: null,
    };
    positions.push(position);
    positionByKey.set(position.positionKey, position);
  }

  const resolveGroup = (group, expectedKind) => {
    const seen = new Set();
    for (const positionKey of group.positionKeys) {
      if (seen.has(positionKey)) {
        errors.push("DUPLICATE_GROUP_REFERENCE");
      }
      seen.add(positionKey);
      const position = positionByKey.get(positionKey);
      if (!position) {
        errors.push("UNKNOWN_GROUP_REFERENCE");
      } else if (
        position.subjectType !== group.subjectType ||
        (expectedKind && position.positionKind !== expectedKind)
      ) {
        errors.push("INVALID_GROUP_REFERENCE");
      }
    }
  };
  for (const group of input.displayConfig.featuredGroups) {
    resolveGroup(group, null);
  }
  for (const group of input.displayConfig.castGroups) {
    resolveGroup(group, "cast");
    const categories = categoryGroupsByType.get(group.subjectType) ?? [];
    const anchors = categories.filter(
      (category) => category.key === group.anchorCategoryKey,
    );
    if (anchors.length !== 1) {
      errors.push("CAST_GROUP_ANCHOR_MISSING");
    } else if (
      normalizedNames(anchors[0].names).cn !== "声音类" ||
      normalizedNames(anchors[0].names).en !== "music"
    ) {
      errors.push("CAST_GROUP_ANCHOR_LABEL_INVALID");
    }
  }
  for (const group of input.displayConfig.additionalDisplayGroups) {
    resolveGroup(group, null);
  }

  const groups = [];
  for (const subjectType of SUBJECT_TYPES) {
    let displayOrder = 10;
    const featured = input.displayConfig.featuredGroups.find(
      (group) => group.subjectType === subjectType,
    );
    if (featured) {
      groups.push({
        groupKey: `shortcut:${subjectType}:featured`,
        subjectType,
        label: featured.label,
        displayOrder,
        positionKeys: [...featured.positionKeys],
      });
      displayOrder += 10;
    }
    const catalog = commonByType.get(subjectType);
    const categories = categoryGroupsByType.get(subjectType) ?? [];
    for (const category of categories) {
      const categoryMembers = stableOrdered(
        catalog.positions.filter((position) =>
          position.categoryKeys.includes(category.key),
        ),
        (position) => position.id,
      ).map((position) => `staff:${subjectType}:${position.id}`);
      groups.push({
        groupKey: `bangumi:${subjectType}:${category.key}`,
        subjectType,
        label: normalizedNames(category.names).cn,
        displayOrder,
        positionKeys: categoryMembers,
      });
      displayOrder += 10;
      const castGroup = input.displayConfig.castGroups.find(
        (group) =>
          group.subjectType === subjectType &&
          group.anchorCategoryKey === category.key,
      );
      if (castGroup) {
        groups.push({
          groupKey: `shortcut:${subjectType}:cast`,
          subjectType,
          label: castGroup.label,
          displayOrder,
          positionKeys: [...castGroup.positionKeys],
        });
        displayOrder += 10;
      }
    }
    const fallbackMembers = stableOrdered(
      catalog.positions.filter((position) =>
        categories.length === 0 ? true : position.categoryKeys.length === 0,
      ),
      (position) => position.id,
    ).map((position) => `staff:${subjectType}:${position.id}`);
    if (fallbackMembers.length > 0) {
      groups.push({
        groupKey: `fallback:${subjectType}:${categories.length === 0 ? "all" : "other"}`,
        subjectType,
        label: categories.length === 0 ? "全部职位" : "其他",
        displayOrder,
        positionKeys: fallbackMembers,
      });
      displayOrder += 10;
    }
    const typeSets = input.staffSetConfig.sets
      .filter((set) => set.subjectType === subjectType)
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder || compareAscii(left.key, right.key),
      );
    if (typeSets.length > 0) {
      groups.push({
        groupKey: `custom:${subjectType}:staff-sets`,
        subjectType,
        label: "人工职位集合",
        displayOrder,
        positionKeys: typeSets.map((set) => set.key),
      });
      displayOrder += 10;
    }
    for (const additional of input.displayConfig.additionalDisplayGroups
      .filter((group) => group.subjectType === subjectType)
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder ||
          compareAscii(left.groupKey, right.groupKey),
      )) {
      groups.push({
        groupKey: additional.groupKey,
        subjectType,
        label: additional.label,
        displayOrder,
        positionKeys: [...additional.positionKeys],
      });
      displayOrder += 10;
    }
  }
  const groupKeys = new Set();
  for (const group of groups) {
    if (groupKeys.has(group.groupKey)) {
      errors.push("DUPLICATE_GROUP_KEY");
    }
    groupKeys.add(group.groupKey);
  }

  const subjectById = new Map();
  for (const subject of input.archive.subjects) {
    if (subjectById.has(subject.subjectId)) {
      errors.push("DUPLICATE_SUBJECT");
    }
    subjectById.set(subject.subjectId, subject);
  }
  const personIds = new Set();
  for (const person of input.archive.persons) {
    if (personIds.has(person.personId)) {
      errors.push("DUPLICATE_PERSON");
    }
    personIds.add(person.personId);
  }
  const characterIds = new Set();
  for (const character of input.archive.characters) {
    if (characterIds.has(character.characterId)) {
      errors.push("DUPLICATE_CHARACTER");
    }
    characterIds.add(character.characterId);
  }
  const validCv = new Set();
  const staffCreditKeys = new Set();
  const staffCredits = [];
  for (const credit of input.archive.staffCredits) {
    const subject = subjectById.get(credit.subjectId);
    const creditKey = `${credit.subjectId}:${credit.personId}:${credit.positionId}`;
    if (staffCreditKeys.has(creditKey)) {
      errors.push("DUPLICATE_STAFF_CREDIT");
    }
    staffCreditKeys.add(creditKey);
    if (!subject) {
      errors.push("STAFF_CREDIT_SUBJECT_MISSING");
    }
    if (!personIds.has(credit.personId)) {
      errors.push("STAFF_CREDIT_PERSON_MISSING");
    }
    if (!subject || !personIds.has(credit.personId)) {
      continue;
    }
    validCv.add(credit.personId);
    const resolved = commonPositionIds
      .get(subject.subjectType)
      ?.has(credit.positionId);
    staffCredits.push({
      subjectType: subject.subjectType,
      subjectId: credit.subjectId,
      personId: credit.personId,
      positionId: credit.positionId,
      positionKey: resolved
        ? `staff:${subject.subjectType}:${credit.positionId}`
        : null,
    });
  }
  const subjectCharacterByKey = new Map();
  for (const row of input.archive.subjectCharacters) {
    const subject = subjectById.get(row.subjectId);
    if (!subject) {
      errors.push("SUBJECT_CHARACTER_SUBJECT_MISSING");
    }
    if (!characterIds.has(row.characterId)) {
      errors.push("SUBJECT_CHARACTER_CHARACTER_MISSING");
    }
    if (!Number.isInteger(row.type) || row.type < 1 || row.type > 6) {
      errors.push("UNKNOWN_CAST_ROLE");
    }
    const key = `${row.subjectId}:${row.characterId}`;
    const prior = subjectCharacterByKey.get(key);
    if (prior) {
      if (prior.type === row.type && prior.order === row.order) {
        errors.push("DUPLICATE_SUBJECT_CHARACTER");
      } else {
        errors.push("CONFLICTING_SUBJECT_CHARACTER");
      }
    } else {
      subjectCharacterByKey.set(key, row);
    }
  }
  const exactJoinedEdges = [];
  const personCharacterKeys = new Set();
  for (const edge of input.archive.personCharacters) {
    const subject = subjectById.get(edge.subjectId);
    if (!subject) {
      errors.push("PERSON_CHARACTER_SUBJECT_MISSING");
    }
    if (!characterIds.has(edge.characterId)) {
      errors.push("PERSON_CHARACTER_CHARACTER_MISSING");
    }
    if (!personIds.has(edge.personId)) {
      errors.push("PERSON_CHARACTER_PERSON_MISSING");
    }
    const identity = `${edge.subjectId}:${edge.characterId}:${edge.personId}`;
    if (personCharacterKeys.has(identity)) {
      errors.push("DUPLICATE_PERSON_CHARACTER");
    }
    personCharacterKeys.add(identity);
    const subjectCharacter = subjectCharacterByKey.get(
      `${edge.subjectId}:${edge.characterId}`,
    );
    if (!subjectCharacter) {
      errors.push("PERSON_CHARACTER_SUBJECT_CHARACTER_MISSING");
    }
    if (
      subject &&
      characterIds.has(edge.characterId) &&
      personIds.has(edge.personId) &&
      subjectCharacter
    ) {
      exactJoinedEdges.push({
        subjectId: edge.subjectId,
        characterId: edge.characterId,
        personId: edge.personId,
        roleType: subjectCharacter.type,
        sourceOrder: subjectCharacter.order,
      });
    }
  }
  const relationKeys = new Set();
  for (const relation of input.archive.subjectRelations) {
    if (
      !subjectById.has(relation.subjectId) ||
      !subjectById.has(relation.relatedSubjectId)
    ) {
      errors.push("SUBJECT_RELATION_REFERENCE_MISSING");
    }
    const key = `${relation.subjectId}:${relation.relatedSubjectId}:${relation.relationType}`;
    if (relationKeys.has(key)) {
      errors.push("DUPLICATE_SUBJECT_RELATION");
    }
    relationKeys.add(key);
  }

  const castCredits = exactJoinedEdges
    .filter((edge) => {
      const subject = subjectById.get(edge.subjectId);
      return (
        subject &&
        CAST_TYPES.has(subject.subjectType) &&
        validCv.has(edge.personId) &&
        edge.roleType >= 1 &&
        edge.roleType <= 6
      );
    })
    .map((edge) => ({
      subjectType: subjectById.get(edge.subjectId).subjectType,
      subjectId: edge.subjectId,
      characterId: edge.characterId,
      personId: edge.personId,
      roleType: edge.roleType,
      sourceOrder: edge.sourceOrder,
      eligible: true,
      provenance: "exact",
    }))
    .sort(edgeComparator);

  const qualityReport = buildQualityReport(
    input,
    commonPositionIds,
    exactJoinedEdges,
    validCv,
  );
  qualityReport.blockingErrors = uniqueErrors(errors);
  const finalErrors = uniqueErrors(errors);
  if (finalErrors.length > 0) {
    return {
      outcome: "INVALID",
      errorCodes: finalErrors,
      canonicalConfig: null,
      projection: null,
    };
  }

  const typeIndex = (position) => SUBJECT_TYPES.indexOf(position.subjectType);
  positions.sort(
    (left, right) =>
      typeIndex(left) - typeIndex(right) ||
      left.displayOrder - right.displayOrder ||
      compareAscii(left.positionKey, right.positionKey),
  );
  staffSets.sort((left, right) => compareAscii(left.key, right.key));
  staffCredits.sort(
    (left, right) =>
      SUBJECT_TYPES.indexOf(left.subjectType) -
        SUBJECT_TYPES.indexOf(right.subjectType) ||
      left.subjectId - right.subjectId ||
      left.personId - right.personId ||
      left.positionId - right.positionId,
  );
  return {
    outcome: "VALID",
    errorCodes: [],
    canonicalConfig: canonicalizeConfig(
      input.displayConfig,
      input.staffSetConfig,
    ),
    projection: {
      positions,
      groups,
      staffSets,
      staffCredits,
      castCredits,
      qualityReport,
    },
  };
}

function applyMutation(baseInput, mutationId, fixtureConfigs) {
  const input = clone(baseInput);
  switch (mutationId) {
    case "synthetic-staff-set":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      break;
    case "synthetic-staff-set-members-reordered":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      input.staffSetConfig.sets[0].members.reverse();
      break;
    case "staff-set-label-changed":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      input.staffSetConfig.sets[0].label = "导演家族";
      break;
    case "missing-featured-position":
      input.displayConfig.featuredGroups[0].positionKeys[0] = "staff:anime:999999";
      break;
    case "duplicate-featured-position":
      input.displayConfig.featuredGroups[0].positionKeys[1] =
        input.displayConfig.featuredGroups[0].positionKeys[0];
      break;
    case "cross-type-staff-set-member":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      input.staffSetConfig.sets[0].members[1] = "staff:game:1001";
      break;
    case "cast-staff-set-member":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      input.staffSetConfig.sets[0].members[1] = "cast:anime:all";
      break;
    case "unknown-staff-set-member":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      input.staffSetConfig.sets[0].members[1] = "staff:anime:999999";
      break;
    case "missing-cast-anchor":
      input.displayConfig.castGroups[0].anchorCategoryKey = "missing-music";
      break;
    case "missing-chinese-label": {
      const anime = input.commonCatalog.find(
        (catalog) => catalog.subjectType === "anime",
      );
      anime.positions.find((position) => position.id === 201).names = {
        cn: null,
        en: null,
        jp: null,
      };
      break;
    }
    case "unknown-cast-role":
      input.archive.subjectCharacters[0].type = 7;
      break;
    case "official-position-credit-only":
      input.archive.staffCredits.push({
        subjectId: 9717,
        personId: 11,
        positionId: 105,
        sourceOrder: 99,
      });
      break;
    case "missing-category-chinese-label": {
      const anime = input.commonCatalog.find(
        (catalog) => catalog.subjectType === "anime",
      );
      anime.categories.find((category) => category.key === "visual").names.cn = null;
      break;
    }
    case "phantom-person-cast-edge":
      input.archive.personCharacters.push({
        subjectId: 9717,
        characterId: 9001,
        personId: 999999,
      });
      break;
    case "phantom-character-cast-edge":
      input.archive.subjectCharacters.push({
        subjectId: 9717,
        characterId: 999999,
        type: 1,
        order: 99,
      });
      input.archive.personCharacters.push({
        subjectId: 9717,
        characterId: 999999,
        personId: 11,
      });
      break;
    case "conflicting-subject-character":
      input.archive.subjectCharacters.push({
        subjectId: 9717,
        characterId: 9001,
        type: 2,
        order: 99,
      });
      break;
    case "duplicate-subject-character":
      input.archive.subjectCharacters.push(
        clone(input.archive.subjectCharacters[0]),
      );
      break;
    case "duplicate-person-character":
      input.archive.personCharacters.push(
        clone(input.archive.personCharacters[0]),
      );
      break;
    case "duplicate-staff-credit":
      input.archive.staffCredits.push(clone(input.archive.staffCredits[0]));
      break;
    case "additional-staff-set-group-collision":
      input.staffSetConfig = clone(fixtureConfigs.syntheticStaffSets);
      input.displayConfig.additionalDisplayGroups.push({
        groupKey: "custom:anime:staff-sets",
        subjectType: "anime",
        label: "重复集合分组",
        displayOrder: 1,
        positionKeys: ["staff:anime:2"],
      });
      break;
    case "cast-anchor-label-drift": {
      const anime = input.commonCatalog.find(
        (catalog) => catalog.subjectType === "anime",
      );
      anime.categories.find((category) => category.key === "music").names.cn =
        "音频类";
      break;
    }
    default:
      throw new Error(`unknown mutation: ${mutationId}`);
  }
  return input;
}

function validateQualitySemantics(report) {
  for (const key of [
    "NO_CHARACTERS",
    "NO_CAST_RELATIONS",
    "FILTERED_BY_VALID_CV",
  ]) {
    assert.ok(
      report.samples[key].length <= report.counts[key],
      `quality sample exceeds count for ${key}`,
    );
    assert.equal(
      report.samples[key].length,
      Math.min(report.counts[key], 100),
      `quality sample bound mismatch for ${key}`,
    );
  }
  assert.deepEqual(
    report.samples.NO_CHARACTERS,
    [...report.samples.NO_CHARACTERS].sort(sampleSubjectComparator),
    "NO_CHARACTERS samples must be sorted",
  );
  assert.deepEqual(
    report.samples.NO_CAST_RELATIONS,
    [...report.samples.NO_CAST_RELATIONS].sort(sampleSubjectComparator),
    "NO_CAST_RELATIONS samples must be sorted",
  );
  assert.deepEqual(
    report.samples.FILTERED_BY_VALID_CV,
    [...report.samples.FILTERED_BY_VALID_CV].sort(edgeComparator),
    "FILTERED_BY_VALID_CV samples must be sorted",
  );
}

async function createValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false,
    allowUnionTypes: true,
  });
  const schemas = new Map();
  for (const fileName of SCHEMA_FILES) {
    const schema = await readJson(path.join(SCHEMA_ROOT, fileName));
    schemas.set(fileName, schema);
    ajv.addSchema(schema);
  }
  return {
    ajv,
    schemas,
    display: ajv.getSchema(
      "https://bangumi-staff-stats.invalid/schemas/catalog/display-config-v1.json",
    ),
    staffSet: ajv.getSchema(
      "https://bangumi-staff-stats.invalid/schemas/catalog/staff-set-config-v1.json",
    ),
    derivation: ajv.getSchema(
      "https://bangumi-staff-stats.invalid/schemas/catalog/derivation-case-v1.json",
    ),
    projection: ajv.compile({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $ref: "https://bangumi-staff-stats.invalid/schemas/catalog/derivation-case-v1.json#/$defs/projection",
    }),
    quality: ajv.getSchema(
      "https://bangumi-staff-stats.invalid/schemas/catalog/quality-report-v1.json",
    ),
    index: ajv.getSchema(
      "https://bangumi-staff-stats.invalid/schemas/catalog/golden-index-v1.json",
    ),
  };
}

async function verifyFatalUtf8Negative() {
  const invalid = Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]);
  assert.throws(() => decoder.decode(invalid), /encoded data/i);
}

async function main() {
  const validators = await createValidators();
  for (const [fileName, schema] of validators.schemas) {
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
      `${fileName} must use JSON Schema 2020-12`,
    );
  }
  if (process.env.CATALOG_PRINT_EXPECTED) {
    const casePath = path.join(
      GOLDEN_ROOT,
      "cases",
      `${process.env.CATALOG_PRINT_EXPECTED}.json`,
    );
    const document = await readJson(casePath);
    assert.equal(
      validators.derivation(document),
      true,
      JSON.stringify(validators.derivation.errors),
    );
    process.stdout.write(
      `${JSON.stringify(deriveCase(document.input, validators), null, 2)}\n`,
    );
    return;
  }

  const indexPath = path.join(GOLDEN_ROOT, "index.json");
  const index = await readJson(indexPath);
  assert.equal(validators.index(index), true, JSON.stringify(validators.index.errors));
  const physicalPaths = (await walkRegularFiles(GOLDEN_ROOT)).filter(
    (relative) => relative !== "index.json",
  );
  if (process.env.CATALOG_NEGATIVE_CLOSED_INVENTORY === "extra") {
    physicalPaths.push("cases/unindexed-negative.json");
    physicalPaths.sort(compareAscii);
  }
  if (process.env.CATALOG_NEGATIVE_CLOSED_INVENTORY === "missing") {
    physicalPaths.pop();
  }
  const indexedPaths = index.entries.map((entry) => entry.path);
  assert.equal(new Set(indexedPaths).size, indexedPaths.length, "duplicate index path");
  assert.equal(
    new Set(index.entries.map((entry) => entry.caseId)).size,
    index.entries.length,
    "duplicate index case id",
  );
  assert.deepEqual(indexedPaths, [...indexedPaths].sort(compareAscii), "index not sorted");
  assert.deepEqual(physicalPaths, indexedPaths, "closed golden path inventory drift");
  if (process.env.CATALOG_NEGATIVE_FATAL_UTF8 === "1") {
    decoder.decode(
      Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
    );
  }

  const documents = new Map();
  for (const entry of index.entries) {
    const absolute = path.join(GOLDEN_ROOT, entry.path);
    const bytes = await readFile(absolute);
    assert.equal(sha256Bytes(bytes), entry.sha256, `hash drift: ${entry.path}`);
    documents.set(entry.path, await readJson(absolute));
  }

  const fixtureConfigs = {
    display: documents.get("config/display-v1.json"),
    emptyStaffSets: documents.get("config/staff-sets-empty-v1.json"),
    syntheticStaffSets: documents.get("config/staff-sets-synthetic-v1.json"),
  };
  assert.equal(validators.display(fixtureConfigs.display), true);
  assert.deepEqual(configSemanticErrors(fixtureConfigs.display), []);
  assert.equal(validators.staffSet(fixtureConfigs.emptyStaffSets), true);
  assert.equal(validators.staffSet(fixtureConfigs.syntheticStaffSets), true);

  let derivationCount = 0;
  for (const entry of index.entries) {
    const document = documents.get(entry.path);
    if (entry.caseKind === "display-config") {
      assert.equal(validators.display(document), entry.outcome === "VALID");
      continue;
    }
    if (entry.caseKind === "staff-set-config") {
      assert.equal(validators.staffSet(document), entry.outcome === "VALID");
      continue;
    }
    if (entry.caseKind === "quality-report") {
      assert.equal(validators.quality(document), entry.outcome === "VALID");
      if (entry.outcome === "VALID") {
        validateQualitySemantics(document);
      }
      continue;
    }
    assert.equal(entry.caseKind, "derivation");
    assert.equal(validators.derivation(document), true, JSON.stringify(validators.derivation.errors));
    derivationCount += 1;
    const actual = deriveCase(document.input, validators);
    if (process.env.CATALOG_PRINT_EXPECTED === document.caseId) {
      process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    assert.deepEqual(
      {
        outcome: actual.outcome,
        errorCodes: actual.errorCodes,
        canonicalConfig: actual.canonicalConfig,
        projectionDigest: projectionDigest(actual.projection),
      },
      {
        outcome: document.expected.outcome,
        errorCodes: document.expected.errorCodes,
        canonicalConfig: document.expected.canonicalConfig,
        projectionDigest: document.expected.projectionDigest,
      },
      `derivation mismatch: ${document.caseId}`,
    );
    assert.equal(
      validators.projection(actual.projection),
      true,
      JSON.stringify(validators.projection.errors),
    );
    assert.deepEqual(
      document.expected.variants.map((variant) => variant.mutationId),
      EXPECTED_MUTATIONS,
      "derivation mutation matrix drift",
    );
    assert.deepEqual(
      actual.projection.qualityReport,
      documents.get("quality/complete-source-sentinel.json"),
      "quality golden must equal recomputation",
    );
    assert.equal(
      new Set(actual.projection.positions.map((position) => position.positionKey))
        .size,
      actual.projection.positions.length,
      "position entities must be unique",
    );
    assert.equal(
      new Set(actual.projection.groups.map((group) => group.groupKey)).size,
      actual.projection.groups.length,
      "group identities must be unique",
    );
    assert.equal(
      new Set(
        actual.projection.castCredits.map(
          (credit) =>
            `${credit.subjectType}:${credit.subjectId}:${credit.personId}:${credit.characterId}`,
        ),
      ).size,
      actual.projection.castCredits.length,
      "cast identities must be unique",
    );
    assert.equal(
      new Set(
        actual.projection.staffCredits.map(
          (credit) =>
            `${credit.subjectType}:${credit.subjectId}:${credit.personId}:${credit.positionId}`,
        ),
      ).size,
      actual.projection.staffCredits.length,
      "staff-credit identities must be unique",
    );
    for (const positionId of [101, 102, 103, 104, 105, 106]) {
      assert.ok(
        actual.projection.positions.some(
          (position) =>
            position.positionKey === `staff:anime:${positionId}` &&
            position.positionKind === "staff",
        ),
        `official position ${positionId} must remain staff`,
      );
      assert.ok(
        actual.projection.staffCredits.some(
          (credit) =>
            credit.subjectId === 9717 &&
            credit.positionId === positionId &&
            credit.positionKey === `staff:anime:${positionId}`,
        ),
        `official position ${positionId} credit must remain exact staff`,
      );
    }
    assert.ok(
      actual.projection.staffCredits.some(
        (credit) =>
          credit.subjectId === 9717 &&
          credit.personId === 6756 &&
          credit.positionId === 104 &&
          credit.positionKey === "staff:anime:104",
      ),
      "person 6756 / subject 9717 / position 104 sentinel must remain exact staff",
    );
    assert.ok(
      actual.projection.positions.some(
        (position) => position.positionKey === "staff:anime:201",
      ),
      "defined position without credits must remain selectable",
    );
    assert.equal(
      actual.projection.groups.filter((group) =>
        group.positionKeys.includes("staff:anime:2"),
      ).length,
      3,
      "featured multi-category position must have three references",
    );
    assert.equal(
      actual.projection.castCredits.some((credit) => credit.subjectId === 300),
      false,
      "related-work-only cast must not be inferred",
    );
    assert.deepEqual(
      [...new Set(actual.projection.castCredits.map((credit) => credit.roleType))].sort(
        (left, right) => left - right,
      ),
      [1, 2, 3, 4, 5, 6],
      "all admitted raw cast roles must round-trip",
    );
    for (const credit of actual.projection.castCredits) {
      const subjectCharacter = document.input.archive.subjectCharacters.find(
        (row) =>
          row.subjectId === credit.subjectId &&
          row.characterId === credit.characterId,
      );
      assert.ok(subjectCharacter, "cast credit must retain a subject-character source");
      assert.equal(credit.roleType, subjectCharacter.type);
      assert.equal(credit.sourceOrder, subjectCharacter.order);
      assert.ok(
        document.input.archive.personCharacters.some(
          (row) =>
            row.subjectId === credit.subjectId &&
            row.characterId === credit.characterId &&
            row.personId === credit.personId,
        ),
        "cast credit must retain a person-character identity edge",
      );
    }
    assert.deepEqual(actual.projection.staffSets, [], "active staff sets must be empty");
    for (const subjectType of ["anime", "game"]) {
      const musicIndex = actual.projection.groups.findIndex(
        (group) => group.groupKey === `bangumi:${subjectType}:music`,
      );
      assert.notEqual(
        musicIndex,
        -1,
        `${subjectType} must preserve exact common music category key`,
      );
      assert.equal(
        actual.projection.groups[musicIndex + 1].groupKey,
        `shortcut:${subjectType}:cast`,
        `${subjectType} cast group must immediately follow exact common music`,
      );
      assert.equal(
        actual.projection.groups[musicIndex].label,
        "声音类",
        `${subjectType} music anchor must preserve the pinned Chinese label`,
      );
      assert.deepEqual(
        actual.projection.groups.find(
          (group) => group.groupKey === `shortcut:${subjectType}:featured`,
        ).positionKeys,
        EXPECTED_FEATURED[subjectType],
      );
    }
    const variantResults = new Map();
    for (const variant of document.expected.variants) {
      const mutatedInput = applyMutation(
        document.input,
        variant.mutationId,
        fixtureConfigs,
      );
      const result = deriveCase(mutatedInput, validators);
      variantResults.set(variant.mutationId, result);
      assert.equal(result.outcome, variant.outcome, variant.mutationId);
      assert.deepEqual(result.errorCodes, variant.errorCodes, variant.mutationId);
      if (variant.outcome === "VALID") {
        assert.notEqual(
          result.projection,
          null,
          `${variant.mutationId}: valid variant must produce a projection`,
        );
        assert.equal(
          validators.projection(result.projection),
          true,
          `${variant.mutationId}: ${JSON.stringify(validators.projection.errors)}`,
        );
      } else {
        assert.equal(
          result.projection,
          null,
          `${variant.mutationId}: invalid variant must not produce a projection`,
        );
      }
      if (variant.sameCatalogConfigDigest === null) {
        assert.equal(result.canonicalConfig, null, variant.mutationId);
      } else {
        assert.notEqual(result.canonicalConfig, null, variant.mutationId);
        assert.equal(
          result.canonicalConfig.digest === actual.canonicalConfig.digest,
          variant.sameCatalogConfigDigest,
          variant.mutationId,
        );
      }
      if (
        variant.mutationId === "synthetic-staff-set" ||
        variant.mutationId === "synthetic-staff-set-members-reordered"
      ) {
        assert.deepEqual(result.projection.staffSets, [
          {
            key: "staffset:anime:director-family",
            members: ["staff:anime:2", "staff:anime:74"],
            capabilities: CAPABILITIES,
          },
        ]);
      }
      if (variant.mutationId === "official-position-credit-only") {
        assert.deepEqual(
          result.projection.castCredits,
          actual.projection.castCredits,
          "official staff position must not derive cast",
        );
      }
      if (
        variant.mutationId === "phantom-person-cast-edge" ||
        variant.mutationId === "phantom-character-cast-edge"
      ) {
        assert.equal(result.projection, null, "phantom cast must never be eligible");
      }
    }
    assert.equal(
      variantResults.get("synthetic-staff-set").canonicalConfig.digest,
      variantResults.get("synthetic-staff-set-members-reordered").canonicalConfig
        .digest,
      "staff-set member order must be non-semantic",
    );
    assert.notEqual(
      variantResults.get("synthetic-staff-set").canonicalConfig.digest,
      variantResults.get("staff-set-label-changed").canonicalConfig.digest,
      "staff-set label must change catalogConfigDigest",
    );
  }
  assert.ok(derivationCount >= 1, "at least one derivation case is required");
  await verifyFatalUtf8Negative();

  const schemaInventory = (await walkRegularFiles(SCHEMA_ROOT)).filter(
    (relative) =>
      !relative.startsWith(".cache/") &&
      !relative.startsWith(".tmp/") &&
      !relative.startsWith("tooling/node_modules/"),
  );
  assert.deepEqual(
    schemaInventory,
    [
      "README.md",
      "derivation-case.schema.json",
      "display-config.schema.json",
      "golden-index.schema.json",
      "quality-report.schema.json",
      "staff-set-config.schema.json",
      "tooling/package-lock.json",
      "tooling/package.json",
      "tooling/verify.mjs",
    ],
    "catalog schema/tool inventory drift",
  );

  const pathSeal = sha256Text(`${indexedPaths.join("\n")}\n`);
  const digestSeal = sha256Text(
    `${index.entries.map((entry) => `${entry.path} ${entry.sha256}`).join("\n")}\n`,
  );
  process.stdout.write(
    `catalog contracts verified: ${index.entries.length} indexed files; pathSeal=${pathSeal}; digestSeal=${digestSeal}\n`,
  );
}

await main();
