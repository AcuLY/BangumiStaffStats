#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, "../../..");
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const same = (actual, expected, location) => {
  assert(canonical(actual) === canonical(expected), `${location}: expected ${canonical(expected)}, got ${canonical(actual)}`);
};
const walk = async (dir) => {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else output.push(relative(root, path));
  }
  return output.sort();
};
const isSortedUnique = (values) => values.every((value, index) => index === 0 || values[index - 1] < value);
const gcdBig = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const fraction = (numerator, denominator = 1n) => {
  assert(denominator !== 0n, "zero denominator");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcdBig(numerator, denominator);
  return { n: numerator / divisor, d: denominator / divisor };
};
const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const multiply = (a, b) => fraction(a.n * b.n, a.d * b.d);
const compareFraction = (a, b) => Number(a.n * b.d - b.n * a.d);
const decimalFraction = (value) => {
  assert(typeof value === "number" && Number.isFinite(value), `not a finite source number: ${canonical(value)}`);
  if (Object.is(value, -0) || value === 0) return fraction(0n);
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  assert(match, `unsupported shortest decimal ${String(value)}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const decimals = match[3] ?? "";
  const exponent = Number(match[4] ?? 0) - decimals.length;
  let numerator = sign * BigInt(`${match[2]}${decimals}`);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  return fraction(numerator, denominator);
};
const rationalObject = (value) => value === null ? null : fraction(BigInt(value.numerator), BigInt(value.denominator));
const fractionObject = (value) => ({ numerator: Number(value.n), denominator: Number(value.d) });
const floorFraction = (value) => {
  if (value.n >= 0n) return value.n / value.d;
  return -((-value.n + value.d - 1n) / value.d);
};
const floorMeanHundredths = (values) => {
  assert(values.length > 0, "cannot average empty values");
  const sum = values.reduce(add, fraction(0n));
  return Number(floorFraction(multiply(sum, fraction(100n, BigInt(values.length)))));
};
const halfUp = (numerator, denominator) => Number((2n * numerator + denominator) / (2n * denominator));
const overallHundredths = (averageHundredths, count) => halfUp(BigInt(count * averageHundredths + 2500), BigInt(count + 5));
const bucketForFraction = (value) => {
  const nearest = Number(floorFraction(add(value, fraction(1n, 2n))));
  return Math.max(1, Math.min(10, nearest));
};
const distributionFor = (values) => {
  const buckets = Array(10).fill(0);
  for (const value of values) buckets[bucketForFraction(value) - 1] += 1;
  return buckets;
};
const ratingValue = (unit) => {
  if (!Object.hasOwn(unit, "rating") || unit.rating === null || unit.rating === 0) return null;
  assert(typeof unit.rating === "number" && Number.isFinite(unit.rating) && unit.rating >= 1 && unit.rating <= 10, "invalid successful rating");
  return decimalFraction(unit.rating);
};
const compareDate = (left, right) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : left > right ? 1 : 0;
};
const quarterForDate = (date) => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(date)) return null;
  return { year: Number(date.slice(0, 4)), quarter: Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1 };
};
const validateRationals = (value, location = "$") => {
  if (Array.isArray(value)) return value.forEach((item, index) => validateRationals(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value, "numerator") || Object.hasOwn(value, "denominator")) {
    assert(Number.isSafeInteger(value.numerator) && Number.isSafeInteger(value.denominator) && value.denominator > 0, `${location}: invalid rational`);
    assert(value.numerator === 0 ? value.denominator === 1 : gcdBig(BigInt(value.numerator), BigInt(value.denominator)) === 1n, `${location}: rational is not reduced`);
  }
  for (const [key, child] of Object.entries(value)) validateRationals(child, `${location}.${key}`);
};
const handledCaseIds = new Set();

const validateRatingCase = (item) => {
  if (item.id === "rating-invalid-sentinels") {
    assert(item.expected.errorCode === "STATISTICS_SCORE_INVALID" && item.expected.publishPartial === false, `${item.id}: invalid error contract`);
    const variants = new Map(item.input.variants.map((variant) => [variant.variantId, variant.rating]));
    assert(variants.get("below") < 1 && variants.get("above") > 10 && variants.get("negative") < 1, `${item.id}: range matrix incomplete`);
    same([...variants.values()].filter((value) => value && typeof value === "object").map((value) => value.sentinel).sort(), ["NaN", "NegativeInfinity", "PositiveInfinity"], `${item.id}: non-finite sentinels`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "rating-count-invalid") {
    assert(item.expected.errorCode === "STATISTICS_RATING_COUNT_INVALID" && item.expected.publishPartial === false, `${item.id}: invalid count error contract`);
    assert(item.input.variants.every((variant) => variant.ratingCountBuckets.length === 10 && variant.ratingCountBuckets.some((value) => !Number.isInteger(value) || value < 0)), `${item.id}: invalid count matrix`);
    handledCaseIds.add(item.id);
    return;
  }
  const units = item.input.units;
  const values = units.map(ratingValue).filter((value) => value !== null);
  assert(item.expected.unitCount === units.length, `${item.id}: unit count`);
  assert(item.expected.ratedUnitCount === values.length, `${item.id}: rated unit count`);
  if (values.length === 0) {
    assert(item.expected.averageHundredths === null && item.expected.overallHundredths === null, `${item.id}: empty metrics must be null`);
  } else {
    const average = floorMeanHundredths(values);
    assert(item.expected.averageHundredths === average, `${item.id}: average`);
    assert(item.expected.overallHundredths === overallHundredths(average, values.length), `${item.id}: overall`);
  }
  same(item.expected.distribution, distributionFor(values), `${item.id}: distribution`);
  if (item.input.ratingCountBuckets) {
    assert(item.input.ratingCountBuckets.length === 10 && item.input.ratingCountBuckets.every((value) => Number.isInteger(value) && value >= 0), `${item.id}: rating count buckets`);
    assert(item.expected.ratingCount === item.input.ratingCountBuckets.reduce((sum, value) => sum + value, 0), `${item.id}: rating count`);
  }
  const timelineGroups = new Map();
  for (const unit of units) {
    const value = ratingValue(unit);
    const period = quarterForDate(unit.date);
    if (value === null || period === null) continue;
    const key = `${period.year}-${period.quarter}`;
    const group = timelineGroups.get(key) ?? { ...period, values: [] };
    group.values.push(value);
    timelineGroups.set(key, group);
  }
  const timeline = [...timelineGroups.values()]
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
    .map((group) => ({ year: group.year, quarter: group.quarter, ratedUnitCount: group.values.length, averageHundredths: floorMeanHundredths(group.values) }));
  same(item.expected.timeline, timeline, `${item.id}: timeline`);
  handledCaseIds.add(item.id);
};

const mergeRelationIds = new Set([2, 3, 4, 5, 6, 9, 10, 11, 12]);
const sequelWeights = new Map([
  [1, [5, -5]], [2, [-5, 5]], [3, [5, -5]], [4, [5, -5]], [5, [-5, 5]], [6, [5, -5]],
  [7, [1, 1]], [8, [1, 1]], [9, [1, 1]], [10, [1, 1]], [11, [5, -5]], [12, [-5, 5]], [14, [1, 1]], [99, [1, 1]]
]);
const validateSeriesCase = (item) => {
  if (item.id === "series-relation-boundary-matrix") {
    const merged = [];
    const singletons = [];
    for (const variant of item.input.variants) {
      const canMerge = variant.sourceId > 0 && variant.targetId > 0 && variant.sourceExists !== false && variant.targetExists !== false
        && variant.sourceType === "anime" && variant.targetType === variant.sourceType && mergeRelationIds.has(variant.relationId);
      (canMerge ? merged : singletons).push(variant.variantId);
    }
    same(item.expected.mergedVariantIds, merged.sort(), `${item.id}: merged matrix`);
    same(item.expected.singletonVariantIds, singletons.sort(), `${item.id}: fallback matrix`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "series-transitive-minimum-id") {
    const subjectById = new Map(item.input.subjects.map((subject) => [subject.subjectId, subject]));
    const buildComponents = (relations) => {
      const parents = new Map(item.input.subjects.map((subject) => [subject.subjectId, subject.subjectId]));
      const find = (id) => {
        let rootId = id;
        while (parents.get(rootId) !== rootId) rootId = parents.get(rootId);
        while (parents.get(id) !== id) {
          const next = parents.get(id);
          parents.set(id, rootId);
          id = next;
        }
        return rootId;
      };
      const union = (a, b) => {
        a = find(a);
        b = find(b);
        if (a !== b) parents.set(Math.max(a, b), Math.min(a, b));
      };
      for (const relation of relations) {
        const source = subjectById.get(relation.sourceId);
        const target = subjectById.get(relation.targetId);
        if (source?.subjectType === "anime" && target?.subjectType === source.subjectType && mergeRelationIds.has(relation.relationId)) union(source.subjectId, target.subjectId);
      }
      const groups = new Map();
      for (const id of [...parents.keys()].sort((a, b) => a - b)) {
        const rootId = find(id);
        const ids = groups.get(rootId) ?? [];
        ids.push(id);
        groups.set(rootId, ids);
      }
      return [...groups.values()].map((memberIds) => ({ seriesId: memberIds[0], memberIds })).sort((a, b) => a.seriesId - b.seriesId);
    };
    same(item.expected.components, buildComponents(item.input.relations), `${item.id}: components`);
    for (const order of item.input.shuffledRelationOrders) {
      same(order.slice().sort((a, b) => a - b), item.input.relations.map((_, index) => index), `${item.id}: shuffled relation closure`);
      same(item.expected.components, buildComponents(order.map((index) => item.input.relations[index])), `${item.id}: shuffled component determinism`);
    }
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "series-sequel-weight-matrix") {
    const weights = item.input.relationIds.map((relationId) => {
      const [source, target] = sequelWeights.get(relationId) ?? fail(`${item.id}: missing weight`);
      return { relationId, source, target };
    });
    same(item.expected.weights, weights, `${item.id}: weights`);
    assert(item.input.sameType === "anime" && item.input.crossTypeProbes.every((probe) => probe.sourceType !== probe.targetType), `${item.id}: applicability probes`);
    const crossTypeWeights = item.input.crossTypeProbes.map((probe) => {
      const neutral = [7, 8, 9, 10, 14, 99].includes(probe.relationId);
      return { probeId: probe.probeId, source: neutral ? 1 : 0, target: neutral ? 1 : 0 };
    });
    same(item.expected.crossTypeWeights, crossTypeWeights, `${item.id}: cross-type weights`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "series-sequel-order-representative") {
    for (const component of item.input.components) {
      const expected = item.expected.components.find((candidate) => candidate.seriesId === component.seriesId) ?? fail(`${item.id}: missing expected component`);
      const scores = new Map(component.subjects.map((subject) => [subject.subjectId, 0]));
      for (const relation of component.relations) {
        const [source, target] = sequelWeights.get(relation.relationId) ?? fail(`${item.id}: unknown weight`);
        scores.set(relation.sourceId, scores.get(relation.sourceId) + source);
        scores.set(relation.targetId, scores.get(relation.targetId) + target);
      }
      const memberScores = [...scores].sort((a, b) => a[0] - b[0]).map(([subjectId, score]) => ({ subjectId, score }));
      same(expected.memberScores.slice().sort((a, b) => a.subjectId - b.subjectId), memberScores, `${item.id}: member scores`);
      const subjectById = new Map(component.subjects.map((subject) => [subject.subjectId, subject]));
      const memberIds = component.subjects.slice().sort((a, b) => scores.get(b.subjectId) - scores.get(a.subjectId) || compareDate(a.date, b.date) || a.subjectId - b.subjectId).map((subject) => subject.subjectId);
      if (memberIds.length >= 2 && scores.get(memberIds[0]) - scores.get(memberIds[1]) < 15 && compareDate(subjectById.get(memberIds[0]).date, subjectById.get(memberIds[1]).date) > 0) {
        [memberIds[0], memberIds[1]] = [memberIds[1], memberIds[0]];
      }
      same(expected.memberIds, memberIds, `${item.id}: member order`);
      assert(expected.representativeId === memberIds[0], `${item.id}: representative`);
      same(expected.sequelOrder, memberIds.map((subjectId, order) => ({ subjectId, order })), `${item.id}: sequel order`);
    }
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "series-merge-disabled-subject-units") {
    same(item.expected.unitIds, item.input.rawSubjectIds.slice().sort((a, b) => a - b), `${item.id}: unit ids`);
    assert(item.expected.unitKind === "subject" && item.expected.unitCount === item.input.rawSubjectIds.length, `${item.id}: subject unit contract`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "series-raw-intersection-before-merge") {
    const sets = item.input.personSubjectIds.map((person) => new Set(person.subjectIds));
    const intersection = [...sets[0]].filter((id) => sets.slice(1).every((set) => set.has(id))).sort((a, b) => a - b);
    same(item.expected.rawCommonSubjectIds, intersection, `${item.id}: raw intersection`);
    assert(intersection.length === 0 && item.expected.commonSeriesIds.length === 0 && item.expected.unitCount === 0, `${item.id}: inferred cooperation`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "series-equal-weight-actual-participation") {
    const values = [];
    let contributionCount = 0;
    for (const unit of item.input.units) {
      const expected = item.expected.units.find((candidate) => candidate.seriesId === unit.seriesId) ?? fail(`${item.id}: missing expected unit`);
      const ratings = unit.matchedMembers.map(ratingValue).filter((value) => value !== null);
      const normalized = floorMeanHundredths(ratings);
      values.push(fraction(BigInt(normalized), 100n));
      contributionCount += unit.matchedMembers.reduce((sum, member) => sum + member.contributions.length, 0);
      same(expected.completeMemberIds, unit.completeMemberIds, `${item.id}: complete members`);
      same(expected.matchedMemberIds, unit.matchedMembers.map((member) => member.subjectId), `${item.id}: matched members`);
      assert(expected.normalizedRatingHundredths === normalized, `${item.id}: unit rating`);
      assert(unit.matchedMembers.every((member) => member.contributions.every((contribution) => contribution.subjectId === member.subjectId && contribution.personId > 0 && contribution.positionKey && ["staff", "cast"].includes(contribution.kind))), `${item.id}: query contribution shape`);
      assert(expected.contributionCount === unit.matchedMembers.reduce((sum, member) => sum + member.contributions.length, 0), `${item.id}: contributions`);
    }
    const average = floorMeanHundredths(values);
    assert(item.expected.unitCount === item.input.units.length && item.expected.ratedUnitCount === values.length, `${item.id}: counts`);
    assert(item.expected.averageHundredths === average && item.expected.overallHundredths === overallHundredths(average, values.length), `${item.id}: outer metrics`);
    same(item.expected.distribution, distributionFor(values), `${item.id}: distribution`);
    assert(item.expected.timeline.length === 0 && contributionCount === item.expected.units.reduce((sum, unit) => sum + unit.contributionCount, 0), `${item.id}: evidence`);
    handledCaseIds.add(item.id);
    return;
  }
  fail(`${item.id}: unhandled series case`);
};

const validPreferencePair = (subject) => {
  for (const key of ["personalRating", "globalRating"]) {
    if (!Object.hasOwn(subject, key) || subject[key] === null || subject[key] === 0 || typeof subject[key] !== "number" || !Number.isFinite(subject[key]) || subject[key] < 1 || subject[key] > 10) return null;
  }
  return add(decimalFraction(subject.personalRating), multiply(decimalFraction(subject.globalRating), fraction(-1n)));
};
const preferenceResult = (mode, input) => {
  const sourceSubjectIds = [];
  const unitIds = [];
  const unitMeans = [];
  let comparableCount = 0;
  const naturalSeriesIds = new Set();
  if (mode === "subject") {
    for (const subject of input.subjects) {
      const difference = validPreferencePair(subject);
      if (difference === null) continue;
      comparableCount += 1;
      naturalSeriesIds.add(subject.seriesId ?? subject.subjectId);
      sourceSubjectIds.push(subject.subjectId);
      unitIds.push(subject.subjectId);
      unitMeans.push(difference);
    }
  } else {
    for (const series of input.series) {
      const differences = series.subjects.map(validPreferencePair).filter((value) => value !== null);
      if (differences.length === 0) continue;
      comparableCount += differences.length;
      sourceSubjectIds.push(...series.subjects.filter((subject) => validPreferencePair(subject) !== null).map((subject) => subject.subjectId));
      unitIds.push(series.seriesId);
      unitMeans.push(multiply(differences.reduce(add, fraction(0n)), fraction(1n, BigInt(differences.length))));
    }
  }
  const effectiveEvidence = unitMeans.length;
  const mean = effectiveEvidence === 0 ? null : multiply(unitMeans.reduce(add, fraction(0n)), fraction(1n, BigInt(effectiveEvidence)));
  const evidenceWeight = fraction(BigInt(effectiveEvidence), BigInt(effectiveEvidence + 5));
  return {
    comparableCount,
    comparableSeriesCount: mode === "series" ? unitMeans.length : naturalSeriesIds.size,
    effectiveEvidence,
    mean,
    evidenceWeight,
    score: mean === null ? null : multiply(mean, evidenceWeight),
    sourceSubjectIds: sourceSubjectIds.sort((a, b) => a - b),
    unitIds: unitIds.sort((a, b) => a - b),
    unitMeans
  };
};
const assertPreference = (actual, expected, location) => {
  for (const key of ["comparableCount", "comparableSeriesCount", "effectiveEvidence"]) assert(actual[key] === expected[key], `${location}: ${key}`);
  same(actual.mean === null ? null : fractionObject(actual.mean), expected.mean, `${location}: mean`);
  same(fractionObject(actual.evidenceWeight), expected.evidenceWeight, `${location}: evidence weight`);
  same(actual.score === null ? null : fractionObject(actual.score), expected.score, `${location}: score`);
  same(actual.sourceSubjectIds, expected.sourceSubjectIds, `${location}: source ids`);
  same(actual.unitIds, expected.unitIds, `${location}: unit ids`);
};
const validatePreferenceSummaryCase = (item) => {
  if (item.id === "preference-global-no-personal-access") {
    assert(item.input.scope === "global" && !canonical(item.input).includes("personalRating"), `${item.id}: personal input`);
    assert(item.expected.preference === null && item.expected.personalAccessorCalls === 0, `${item.id}: global preference`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "preference-sparse-dense-equal-score") {
    item.input.variants.forEach((variant, index) => assertPreference(preferenceResult(variant.mode, variant), item.expected.variants[index], `${item.id}:${variant.variantId}`));
    same(item.expected.variants[0].score, item.expected.variants[1].score, `${item.id}: equal score sentinel`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id.startsWith("preference-")) {
    const actual = preferenceResult(item.input.mode, item.input);
    assertPreference(actual, item.expected.preference, item.id);
    if (item.expected.preference.unitMeans) {
      same(actual.unitMeans.map((mean, index) => ({ seriesId: actual.unitIds[index], mean: fractionObject(mean) })), item.expected.preference.unitMeans, `${item.id}: unit means`);
    }
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "summary-overlap-dedup-subject") {
    const unitIds = [...new Set(item.input.people.flatMap((person) => person.unitIds))].sort((a, b) => a - b);
    const contributions = item.input.people.flatMap((person) => person.contributions);
    const characterIds = [...new Set(contributions.map((contribution) => contribution.characterId).filter((id) => id !== undefined))].sort((a, b) => a - b);
    const unique = new Map(contributions.map((contribution) => [canonical(contribution), contribution]));
    const attributions = [...unique.values()]
      .sort((a, b) => a.personId - b.personId || a.subjectId - b.subjectId || a.kind.localeCompare(b.kind) || a.positionKey.localeCompare(b.positionKey) || (a.characterId ?? 0) - (b.characterId ?? 0));
    assert(item.expected.personCount === new Set(item.input.people.map((person) => person.personId)).size, `${item.id}: people`);
    assert(item.expected.workCount === unitIds.length && item.expected.characterCount === characterIds.length, `${item.id}: summary counts`);
    same(item.expected.unitIds, unitIds, `${item.id}: units`);
    same(item.expected.characterIds, characterIds, `${item.id}: characters`);
    same(item.expected.attributions, attributions, `${item.id}: attribution order`);
    handledCaseIds.add(item.id);
    return;
  }
  if (item.id === "summary-overlap-dedup-series") {
    const series = item.input.people.flatMap((person) => person.series);
    const unitIds = [...new Set(series.map((unit) => unit.seriesId))].sort((a, b) => a - b);
    const matchedSubjectIds = [...new Set(series.flatMap((unit) => unit.matchedMemberIds))].sort((a, b) => a - b);
    const completeSubjectIds = [...new Set(series.flatMap((unit) => unit.completeMemberIds))].sort((a, b) => a - b);
    assert(item.expected.personCount === new Set(item.input.people.map((person) => person.personId)).size, `${item.id}: people`);
    assert(item.expected.seriesCount === unitIds.length && item.expected.workCount === matchedSubjectIds.length, `${item.id}: counts`);
    same(item.expected.unitIds, unitIds, `${item.id}: units`);
    same(item.expected.matchedSubjectIds, matchedSubjectIds, `${item.id}: matched subjects`);
    same(item.expected.completeSubjectIds, completeSubjectIds, `${item.id}: complete subjects`);
    handledCaseIds.add(item.id);
    return;
  }
  fail(`${item.id}: unhandled preference/summary case`);
};

const compareNumber = (left, right, direction = "descending") => direction === "descending" ? right - left : left - right;
const compareNullableNumber = (left, right, direction) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compareNumber(left, right, direction);
};
const compareNullableRational = (left, right, direction) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const compared = compareFraction(rationalObject(left), rationalObject(right));
  return direction === "descending" ? -compared : compared;
};
const compareTuple = (left, right) => {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
};
const comparatorFor = (profile, direction) => {
  if (profile === "person-count") return (a, b) => compareNumber(a.count, b.count, direction) || compareNullableNumber(a.averageHundredths, b.averageHundredths, "descending") || compareNumber(a.validRatingCount, b.validRatingCount) || a.personId - b.personId;
  if (profile === "person-average") return (a, b) => compareNullableNumber(a.averageHundredths, b.averageHundredths, direction) || compareNumber(a.validRatingCount, b.validRatingCount) || compareNumber(a.count, b.count) || a.personId - b.personId;
  if (profile === "person-overall") return (a, b) => compareNullableNumber(a.overallHundredths, b.overallHundredths, direction) || compareNumber(a.validRatingCount, b.validRatingCount) || compareNumber(a.count, b.count) || compareNullableNumber(a.averageHundredths, b.averageHundredths, "descending") || a.personId - b.personId;
  if (profile === "person-preference") return (a, b) => compareNullableRational(a.preference, b.preference, direction) || compareNumber(a.effectiveEvidence, b.effectiveEvidence) || compareNumber(a.count, b.count) || compareNullableNumber(a.averageHundredths, b.averageHundredths, "descending") || a.personId - b.personId;
  if (profile === "work-or-series-selected-metric") return (a, b) => compareNullableNumber(a.selectedMetricHundredths, b.selectedMetricHundredths, direction) || compareNullableNumber(a.globalScoreHundredths, b.globalScoreHundredths, "descending") || a.unitId - b.unitId;
  if (profile === "person-combination") return (a, b) => compareNumber(a.commonCount, b.commonCount, direction) || compareNullableNumber(a.averageHundredths, b.averageHundredths, "descending") || compareTuple(a.personIds, b.personIds);
  return fail(`unknown sort profile ${profile}`);
};
const identityFor = (profile, entry) => profile === "person-combination" ? entry.personIds : profile === "work-or-series-selected-metric" ? entry.unitId : entry.personId;
const validateSortCase = (item) => {
  const entries = item.input.entries;
  for (const direction of ["descending", "ascending"]) {
    const comparator = comparatorFor(item.input.profile, direction);
    const ids = entries.slice().sort(comparator).map((entry) => identityFor(item.input.profile, entry));
    same(ids, item.expected[`${direction}Ids`], `${item.id}: ${direction}`);
    for (const left of entries) {
      assert(comparator(left, left) === 0, `${item.id}: irreflexivity`);
      for (const right of entries) {
        assert(Math.sign(comparator(left, right)) === -Math.sign(comparator(right, left)), `${item.id}: antisymmetry`);
        if (canonical(identityFor(item.input.profile, left)) !== canonical(identityFor(item.input.profile, right))) assert(comparator(left, right) !== 0, `${item.id}: distinct identity tie`);
        for (const third of entries) {
          if (comparator(left, right) < 0 && comparator(right, third) < 0) assert(comparator(left, third) < 0, `${item.id}: transitivity`);
        }
      }
    }
    const expectedSet = ids.map(canonical).sort();
    same(expectedSet, entries.map((entry) => canonical(identityFor(item.input.profile, entry))).sort(), `${item.id}: entity set`);
  }
  for (const shuffledIds of item.input.shuffledInputIds) {
    const byId = new Map(entries.map((entry) => [canonical(identityFor(item.input.profile, entry)), entry]));
    const shuffled = shuffledIds.map((id) => byId.get(canonical(id)) ?? fail(`${item.id}: unknown shuffled id`));
    same(shuffled.slice().sort(comparatorFor(item.input.profile, "descending")).map((entry) => identityFor(item.input.profile, entry)), item.expected.descendingIds, `${item.id}: shuffled determinism`);
  }
  const pages = [];
  for (let index = 0; index < item.expected.descendingIds.length; index += item.input.pageSize) pages.push(item.expected.descendingIds.slice(index, index + item.input.pageSize));
  same(item.expected.descendingPages, pages, `${item.id}: page boundaries`);
  handledCaseIds.add(item.id);
};

const index = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
assert(index.schemaVersion === 1 && index.contract === "contracts-statistics-goldens/v1" && index.selfHashExcluded === true, "unsupported index");
assert(isSortedUnique(index.files.map((file) => file.path)), "file index is not canonical");
assert(isSortedUnique(index.authorities.map((authority) => authority.id)), "authority index is not canonical");
assert(isSortedUnique(index.caseIds), "case id index is not canonical");
assert(isSortedUnique(index.requiredCoverage), "coverage index is not canonical");
const actualInventory = await walk(root);
const expectedInventory = ["index.json", ...index.files.map((file) => file.path), index.verifier.path].sort();
same(actualInventory, expectedInventory, "inventory");
const indexedPaths = [...index.files.map((file) => file.path), index.verifier.path];
assert(new Set(indexedPaths).size === indexedPaths.length, "duplicate indexed path");
for (const entry of [...index.files, index.verifier]) {
  const bytes = await readFile(join(root, entry.path));
  assert(sha256(bytes) === entry.sha256, `${entry.path}: sha256 mismatch`);
}
for (const authority of index.authorities) {
  if (!authority.sha256) {
    assert(authority.kind === "IMMUTABLE_ORACLE" && /^git:[0-9a-f]{40}$/.test(authority.reference) && authority.commit === authority.reference.slice(4), `${authority.id}: invalid immutable oracle`);
    continue;
  }
  const path = authority.reference.split("#", 1)[0];
  const bytes = await readFile(join(repoRoot, path));
  assert(sha256(bytes) === authority.sha256, `${authority.id}: protected authority hash drift`);
}
const authorityById = new Map(index.authorities.map((authority) => [authority.id, authority]));
assert(authorityById.size === index.authorities.length, "duplicate authority id");
const cases = [];
const documents = new Map();
for (const entry of index.files) {
  const bytes = await readFile(join(root, entry.path));
  assert(!bytes.includes(Buffer.from("/Users/")) && !bytes.includes(Buffer.from("\"uid\"")) && !bytes.includes(Buffer.from("\"credential\"")), `${entry.path}: personal or host-specific data`);
  const document = JSON.parse(bytes.toString("utf8"));
  assert(document.schemaVersion === 1 && Array.isArray(document.cases), `${entry.path}: invalid case document`);
  assert(document.caseKind === entry.kind && !documents.has(document.caseKind), `${entry.path}: case kind mismatch or duplicate`);
  if (["rating", "series", "preference-summary"].includes(document.caseKind)) {
    assert(document.sourceNumberNormalization === "finite-json-number-to-shortest-decimal-before-exact-arithmetic", `${entry.path}: source-number normalization`);
  }
  same(entry.caseIds, document.cases.map((item) => item.id), `${entry.path}: case index`);
  documents.set(document.caseKind, document);
  cases.push(...document.cases);
}
const caseIds = cases.map((item) => item.id);
assert(new Set(caseIds).size === caseIds.length, "duplicate case id");
same(index.caseIds, caseIds.slice().sort(), "top-level case index");
assert(Array.isArray(index.caseManifest) && isSortedUnique(index.caseManifest.map((item) => item.id)), "case manifest is not canonical");
same(
  index.caseManifest,
  cases.map((item) => ({ id: item.id, behaviorClass: item.behaviorClass, authorityRefs: item.authorityRefs })).sort((a, b) => a.id.localeCompare(b.id)),
  "top-level case manifest"
);
const classes = new Set();
const coverage = new Set();
for (const item of cases) {
  assert(["PRESERVE_ORACLE", "INTENTIONAL_DELTA", "NEW_CAPABILITY"].includes(item.behaviorClass), `${item.id}: invalid behavior class`);
  classes.add(item.behaviorClass);
  assert(Array.isArray(item.authorityRefs) && item.authorityRefs.length > 0, `${item.id}: missing authority`);
  const authorities = item.authorityRefs.map((id) => authorityById.get(id) ?? fail(`${item.id}: unknown authority ${id}`));
  if (item.behaviorClass === "PRESERVE_ORACLE") assert(authorities.some((authority) => authority.kind === "IMMUTABLE_ORACLE"), `${item.id}: preserved case lacks oracle`);
  if (item.behaviorClass === "INTENTIONAL_DELTA") assert(authorities.some((authority) => authority.kind === "PRODUCT_RULE") && authorities.some((authority) => authority.kind === "ACCEPTED_DECISION"), `${item.id}: delta lacks product/decision authority`);
  if (item.behaviorClass === "NEW_CAPABILITY") assert(authorities.some((authority) => authority.kind === "APPROVED_SPEC"), `${item.id}: new capability lacks approved spec`);
  assert(Array.isArray(item.coverage) && item.coverage.length > 0 && isSortedUnique(item.coverage.slice().sort()), `${item.id}: missing or duplicate coverage`);
  item.coverage.forEach((key) => coverage.add(key));
  validateRationals(item, item.id);
}
for (const behaviorClass of ["PRESERVE_ORACLE", "INTENTIONAL_DELTA", "NEW_CAPABILITY"]) assert(classes.has(behaviorClass), `missing behavior class ${behaviorClass}`);
for (const key of index.requiredCoverage) assert(coverage.has(key), `missing coverage ${key}`);
for (const item of documents.get("rating").cases) validateRatingCase(item);
for (const item of documents.get("series").cases) validateSeriesCase(item);
for (const item of documents.get("preference-summary").cases) validatePreferenceSummaryCase(item);
for (const item of documents.get("sort").cases) validateSortCase(item);
for (const item of documents.get("contract-control").cases) {
  assert(item.id === "statistics-corpus-closed-exact-control", `${item.id}: unknown control case`);
  assert(item.expected.bulkFixtureCopied === false && item.expected.personalFixtureCopied === false && Array.isArray(item.expected.runtimeDependencies) && item.expected.runtimeDependencies.length === 0, `${item.id}: unsafe corpus control`);
  handledCaseIds.add(item.id);
}
same([...handledCaseIds].sort(), index.caseIds, "semantic handler closure");
const result = {
  ok: true,
  contract: index.contract,
  files: index.files.length,
  cases: cases.length,
  assertions: "inventory+authority+formula+component+preference+summary+strict-order",
  inventorySha256: sha256(Buffer.from(canonical(actualInventory))),
  resultSha256: sha256(Buffer.from(canonical({ caseIds: index.caseIds, coverage: [...coverage].sort() })))
};
process.stdout.write(`${JSON.stringify(result)}\n`);
