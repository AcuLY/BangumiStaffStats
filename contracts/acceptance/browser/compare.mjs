import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveRunRelative } from '../lib/paths.mjs';
import { sha256File } from '../lib/seal.mjs';

const STYLE_PROPERTIES = Object.freeze([
  'backgroundColor',
  'borderBottomColor',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderBottomStyle',
  'borderBottomWidth',
  'borderLeftColor',
  'borderLeftStyle',
  'borderLeftWidth',
  'borderRightColor',
  'borderRightStyle',
  'borderRightWidth',
  'borderTopColor',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderTopStyle',
  'borderTopWidth',
  'boxShadow',
  'color',
  'display',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'opacity',
  'overflowX',
  'overflowY',
  'position',
  'textAlign',
  'visibility',
]);
const MAX_REPORTED_DIFFERENCES = 200;
const MAX_APPROVED_ADDITION_AREA_RATIO = 0.2;
const EXCEPTION_PROPERTIES = new Set([
  'content-pixels',
  'image-source',
  'text-content',
]);
const EXACT_EXCEPTION_SELECTOR = /^(?:\.[A-Za-z][A-Za-z0-9_-]{1,95}|#[A-Za-z][A-Za-z0-9_-]{1,95})$/u;
const ORACLE_EXCEPTION_SELECTORS = Object.freeze({
  'candidate-dynamic-results': '.person-list--candidate',
  'co-star-dynamic-works': '.subject-work-list',
  'partners-dynamic-results': '.single-cooperation',
  'person-dynamic-evidence': '.person-inspector',
  'ranking-dynamic-results': '.person-list--ranking',
  'ranking-production-feedback': '.app-query-feedback',
});
const REQUIRED_SHARE_EXCEPTIONS = Object.freeze({
  '/': 'root-share-action',
  '/co-star': 'co-star-share-action',
  '/ranking': 'ranking-share-action',
});

export class OracleComparisonError extends Error {
  constructor(message, evidence) {
    super(message);
    this.evidence = evidence;
  }
}

function fail(message, evidence) {
  throw new OracleComparisonError(message, evidence);
}

export function compileOracleExceptionEntries(registry, route, states) {
  if (
    registry === null ||
    typeof registry !== 'object' ||
    !Array.isArray(registry.entries)
  ) {
    fail('oracle exception registry is unavailable');
  }
  if (!['/', '/ranking', '/co-star'].includes(route)) {
    fail(`oracle comparison route is not closed: ${route}`);
  }
  if (
    !Array.isArray(states) ||
    states.some(
      (state) =>
        typeof state !== 'string' ||
        !/^[a-z][a-z0-9-]{1,63}$/u.test(state),
    ) ||
    new Set(states).size !== states.length
  ) {
    fail('oracle comparison states are not one unique closed list');
  }
  const selected = registry.entries.filter(
    (entry) => entry.route === route && states.includes(entry.state),
  );
  const requiredShare = selected.filter(
    (entry) =>
      entry.id === REQUIRED_SHARE_EXCEPTIONS[route] &&
      entry.route === route &&
      entry.state === 'share-action',
  );
  if (
    requiredShare.length !== 1 ||
    requiredShare[0].classification !== 'approved-addition' ||
    requiredShare[0].selector !== '.share-action' ||
    JSON.stringify(requiredShare[0].properties) !==
      JSON.stringify(['text-content', 'content-pixels']) ||
    requiredShare[0].authority?.path !== 'PRODUCT.md' ||
    requiredShare[0].authority?.heading !== 'Share query contract'
  ) {
    fail(`route ${route} omitted its exact bounded share addition`);
  }
  const claims = new Set();
  return Object.freeze(
    selected.map((entry) => {
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !['approved-addition', 'dynamic-data'].includes(entry.classification) ||
        !EXACT_EXCEPTION_SELECTOR.test(entry.selector) ||
        !Array.isArray(entry.properties) ||
        entry.properties.length === 0 ||
        new Set(entry.properties).size !== entry.properties.length ||
        entry.properties.some((property) => !EXCEPTION_PROPERTIES.has(property))
      ) {
        fail(`oracle exception ${entry?.id ?? '<unknown>'} is not exact`);
      }
      for (const property of entry.properties) {
        const claim = `${entry.route}\0${entry.state}\0${entry.selector}\0${property}`;
        if (claims.has(claim)) {
          fail(`oracle exception property is claimed twice: ${entry.id}`);
        }
        claims.add(claim);
      }
      return Object.freeze({
        classification: entry.classification,
        id: entry.id,
        oracleSelector: ORACLE_EXCEPTION_SELECTORS[entry.id] ?? entry.selector,
        properties: Object.freeze([...entry.properties]),
        route: entry.route,
        selector: entry.selector,
        state: entry.state,
      });
    }),
  );
}

async function snapshotPage(page, exceptionEntries, kind) {
  const width = page.viewportSize()?.width;
  const resolvedExceptions = exceptionEntries.map((entry) => ({
    ...entry,
    resolvedSelector:
      kind === 'candidate' &&
      entry.id === 'person-dynamic-evidence' &&
      width < 780
        ? '.person-detail-drawer'
        : kind === 'oracle'
          ? entry.oracleSelector
          : entry.selector,
  }));
  return page.evaluate(
    ({ exceptions, styleProperties }) => {
      const round = (value) => Math.round(value * 10) / 10;
      const normalize = (value) =>
        String(value ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      const visible = (element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const exceptionFor = (element, property) =>
        exceptions.find((entry) => {
          if (!entry.properties.includes(property)) return false;
          if (entry.classification === 'approved-addition') {
            return element.closest(entry.resolvedSelector);
          }
          return element.closest(entry.resolvedSelector);
        });
      const implicitRole = (element) => {
        const name = element.localName;
        if (/^h[1-6]$/.test(name)) return 'heading';
        if (name === 'a' && element.hasAttribute('href')) return 'link';
        if (name === 'button') return 'button';
        if (name === 'img') return 'img';
        if (name === 'main') return 'main';
        if (name === 'nav') return 'navigation';
        if (name === 'header') return 'banner';
        if (name === 'footer') return 'contentinfo';
        if (name === 'select') return 'combobox';
        if (name === 'textarea') return 'textbox';
        if (name === 'input') {
          const type = element.getAttribute('type') ?? 'text';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (['button', 'submit', 'reset'].includes(type)) return 'button';
          return 'textbox';
        }
        if (
          name === 'section' &&
          (element.hasAttribute('aria-label') ||
            element.hasAttribute('aria-labelledby'))
        ) {
          return 'region';
        }
        return null;
      };
      const accessibleName = (element) => {
        if (exceptionFor(element, 'text-content')) return '§dynamic§';
        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy) {
          const value = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ');
          if (normalize(value)) return normalize(value);
        }
        return normalize(
          element.getAttribute('aria-label') ??
            element.getAttribute('alt') ??
            element.getAttribute('title') ??
            element.textContent,
        ).slice(0, 240);
      };
      const semantic = [];
      const semanticElements = document.querySelectorAll(
        '[role],a[href],button,input,select,textarea,img,h1,h2,h3,h4,h5,h6,main,nav,header,footer,section[aria-label],section[aria-labelledby]',
      );
      for (const element of semanticElements) {
        if (!visible(element)) continue;
        const role = element.getAttribute('role') || implicitRole(element);
        if (!role || role === 'presentation' || role === 'none') continue;
        const state = {};
        for (const name of [
          'aria-busy',
          'aria-checked',
          'aria-current',
          'aria-disabled',
          'aria-expanded',
          'aria-pressed',
          'aria-selected',
          'disabled',
          'inert',
        ]) {
          if (element.hasAttribute(name)) state[name] = element.getAttribute(name) ?? '';
        }
        if (element === document.activeElement) state.focused = 'true';
        const textException = exceptionFor(element, 'text-content');
        const item = {
          exceptionClassification: textException?.classification ?? null,
          exceptionId: textException?.id ?? null,
          name: accessibleName(element),
          role,
          state,
          tag: element.localName,
        };
        if (
          element.localName === 'img' &&
          !exceptionFor(element, 'image-source')
        ) {
          item.source = element.getAttribute('src') ?? '';
        }
        semantic.push(item);
      }
      const classFacts = {};
      const counts = {};
      for (const element of document.querySelectorAll('[class]')) {
        if (!visible(element)) continue;
        const enclosingException = exceptions.find((entry) =>
          element.closest(entry.resolvedSelector),
        );
        for (const token of element.classList) {
          if (!/^[A-Za-z][A-Za-z0-9_-]{1,95}$/.test(token)) continue;
          if (!enclosingException) counts[token] = (counts[token] ?? 0) + 1;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const styles = {};
          for (const property of styleProperties) styles[property] = style[property];
          (classFacts[token] ??= []).push({
            box: {
              height: round(box.height),
              width: round(box.width),
              x: round(box.x),
              y: round(box.y),
            },
            exceptionId: enclosingException?.id ?? null,
            styles,
          });
        }
      }
      for (const [token, facts] of Object.entries(classFacts)) {
        classFacts[token] = {
          count: counts[token] ?? 0,
          facts: facts.filter((fact) => fact.exceptionId === null),
        };
      }
      const landmarks = [...document.querySelectorAll('header,main,footer,nav')]
        .filter(visible)
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            box: {
              height: round(box.height),
              width: round(box.width),
              x: round(box.x),
              y: round(box.y),
            },
            role: element.getAttribute('role') || implicitRole(element),
          };
        });
      const nodeRole = (element) =>
        element.getAttribute('role') || implicitRole(element);
      const nodeState = (element) => {
        const state = {};
        for (const name of [
          'aria-busy',
          'aria-checked',
          'aria-current',
          'aria-disabled',
          'aria-expanded',
          'aria-pressed',
          'aria-selected',
          'disabled',
          'inert',
        ]) {
          if (element.hasAttribute(name)) {
            state[name] = element.getAttribute(name) ?? '';
          }
        }
        return state;
      };
      const relativePath = (element, root) => {
        if (element === root) return '$';
        const segments = [];
        let current = element;
        while (current instanceof Element && current !== root) {
          const parent = current.parentElement;
          if (!parent) return '<detached>';
          const siblings = [...parent.children].filter(
            (sibling) => sibling.localName === current.localName,
          );
          segments.push(
            `${current.localName}:${siblings.indexOf(current) + 1}`,
          );
          current = parent;
        }
        return segments.reverse().join('/');
      };
      const exceptionSurfaces = exceptions.map((entry) => ({
        classification: entry.classification,
        id: entry.id,
        properties: [...entry.properties],
        selector: entry.selector,
        surfaces: [...document.querySelectorAll(entry.resolvedSelector)]
          .filter(visible)
          .map((root) => {
            const rootBox = root.getBoundingClientRect();
            return {
              box: {
                height: round(rootBox.height),
                width: round(rootBox.width),
                x: round(rootBox.x),
                y: round(rootBox.y),
              },
              nodes: [root, ...root.querySelectorAll('*')]
                .filter(visible)
                .map((element) => {
                  const box = element.getBoundingClientRect();
                  const style = getComputedStyle(element);
                  const styles = {};
                  for (const property of styleProperties) {
                    styles[property] = style[property];
                  }
                  return {
                    action: {
                      disabled:
                        element.hasAttribute('disabled') ||
                        element.getAttribute('aria-disabled') === 'true',
                      href: element.localName === 'a',
                      interactive: Boolean(
                        element.matches(
                          'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"]',
                        ),
                      ),
                      tabIndex: element.tabIndex,
                    },
                    box: {
                      height: round(box.height),
                      width: round(box.width),
                      x: round(box.x - rootBox.x),
                      y: round(box.y - rootBox.y),
                    },
                    classes: [...element.classList].sort(),
                    path: relativePath(element, root),
                    role: nodeRole(element),
                    state: nodeState(element),
                    styles,
                    tag: element.localName,
                  };
                }),
              role: nodeRole(root),
              tag: root.localName,
            };
          }),
      }));
      return {
        classFacts,
        document: {
          activeRole:
            document.activeElement?.getAttribute('role') ??
            implicitRole(document.activeElement),
          bodyScrollWidth: document.body.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          fontReady: document.fonts.status,
          height: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.dataset.theme ?? null,
          width: document.documentElement.clientWidth,
        },
        landmarks,
        exceptionSurfaces,
        semantic,
      };
    },
    {
      exceptions: resolvedExceptions,
      styleProperties: STYLE_PROPERTIES,
    },
  );
}

function compareBox(left, right, label, differences) {
  for (const field of ['height', 'width', 'x', 'y']) {
    if (Math.abs(left[field] - right[field]) > 1) {
      differences.push({
        actual: left[field],
        expected: right[field],
        field,
        kind: 'geometry',
        target: label,
      });
    }
  }
}

function dynamicSurfaceFormat(surface) {
  const groups = new Map();
  for (const node of surface.nodes) {
    const normalizedPath = node.path.replaceAll(/:[1-9][0-9]*/gu, ':*');
    const key = JSON.stringify({
      action: node.action,
      path: normalizedPath,
      role: node.role,
      state: node.state,
      tag: node.tag,
    });
    const group = groups.get(key) ?? { nodes: [], variants: new Set() };
    group.nodes.push(node);
    group.variants.add(
      JSON.stringify({
        action: node.action,
        box: {
          height: node.box.height,
          ...(node.path === '$' || node.role || node.action.interactive
            ? { width: node.box.width, x: node.box.x }
            : {}),
        },
        role: node.role,
        state: node.state,
        styles: node.styles,
        tag: node.tag,
      }),
    );
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const positions = [...new Set(group.nodes.map((node) => node.box.y))].sort(
        (left, right) => left - right,
      );
      const rhythm = new Set();
      for (let index = 1; index < positions.length; index += 1) {
        rhythm.add(Math.round((positions[index] - positions[index - 1]) * 10) / 10);
      }
      return {
        key: JSON.parse(key),
        rhythm: [...rhythm].sort((left, right) => left - right),
        variants: [...group.variants].sort(),
      };
    })
    .sort((left, right) =>
      JSON.stringify(left.key).localeCompare(JSON.stringify(right.key), 'en'),
    );
}

function compareDynamicSurface(
  left,
  right,
  exceptionId,
  differences,
  add,
) {
  compareBox(left.box, right.box, `exception:${exceptionId}`, differences);
  if (left.tag !== right.tag || left.role !== right.role) {
    add({
      candidate: { role: left.role, tag: left.tag },
      kind: 'exception-surface-hierarchy',
      oracle: { role: right.role, tag: right.tag },
      target: exceptionId,
    });
  }
  const candidateFormat = dynamicSurfaceFormat(left);
  const oracleFormat = dynamicSurfaceFormat(right);
  const candidateGroups = new Map(
    candidateFormat.map((group) => [JSON.stringify(group.key), group]),
  );
  const oracleGroups = new Map(
    oracleFormat.map((group) => [JSON.stringify(group.key), group]),
  );
  const formatDifferences = [];
  for (const key of new Set([
    ...candidateGroups.keys(),
    ...oracleGroups.keys(),
  ])) {
    const candidateGroup = candidateGroups.get(key);
    const oracleGroup = oracleGroups.get(key);
    if (!candidateGroup || !oracleGroup) {
      formatDifferences.push({ key: JSON.parse(key), kind: 'group-presence' });
      continue;
    }
    if (
      JSON.stringify(candidateGroup.variants) !==
      JSON.stringify(oracleGroup.variants)
    ) {
      formatDifferences.push({
        candidate: candidateGroup.variants,
        key: JSON.parse(key),
        kind: 'variants',
        oracle: oracleGroup.variants,
      });
    }
    if (
      candidateGroup.rhythm.length > 0 &&
      oracleGroup.rhythm.length > 0 &&
      JSON.stringify(candidateGroup.rhythm) !==
        JSON.stringify(oracleGroup.rhythm)
    ) {
      formatDifferences.push({
        candidate: candidateGroup.rhythm,
        key: JSON.parse(key),
        kind: 'rhythm',
        oracle: oracleGroup.rhythm,
      });
    }
  }
  if (formatDifferences.length > 0) {
    add({
      differences: formatDifferences.slice(0, 24),
      kind: 'dynamic-surface-format',
      target: exceptionId,
    });
  }
}

export function compareSnapshotFacts(candidate, oracle) {
  const differences = [];
  const add = (difference) => {
    if (differences.length < MAX_REPORTED_DIFFERENCES) differences.push(difference);
  };
  const normalizedSemantic = (snapshot) => {
    const stable = [];
    const dynamic = new Map();
    for (const entry of snapshot.semantic) {
      if (entry.exceptionClassification === 'approved-addition') continue;
      if (entry.exceptionClassification !== 'dynamic-data') {
        stable.push(entry);
        continue;
      }
      const signature = JSON.stringify({
        exceptionClassification: entry.exceptionClassification,
        exceptionId: entry.exceptionId,
        name: entry.name,
        role: entry.role,
        source: entry.source === undefined ? undefined : '§dynamic§',
        state: entry.state,
        tag: entry.tag,
      });
      const signatures = dynamic.get(entry.exceptionId) ?? new Set();
      signatures.add(signature);
      dynamic.set(entry.exceptionId, signatures);
    }
    return {
      dynamic: [...dynamic.entries()]
        .map(([id, signatures]) => [id, [...signatures].sort()])
        .sort(([left], [right]) => left.localeCompare(right, 'en')),
      stable,
    };
  };
  const candidateNormalizedSemantic = normalizedSemantic(candidate);
  const oracleNormalizedSemantic = normalizedSemantic(oracle);
  const candidateSemantic = candidateNormalizedSemantic.stable;
  const oracleSemantic = oracleNormalizedSemantic.stable;
  if (candidateSemantic.length !== oracleSemantic.length) {
    add({
      candidateCount: candidateSemantic.length,
      kind: 'semantic',
      oracleCount: oracleSemantic.length,
    });
  }
  for (
    let index = 0;
    index < Math.min(candidateSemantic.length, oracleSemantic.length);
    index += 1
  ) {
    if (
      JSON.stringify(candidateSemantic[index]) !==
      JSON.stringify(oracleSemantic[index])
    ) {
      add({
        candidate: candidateSemantic[index],
        kind: 'semantic-node',
        oracle: oracleSemantic[index],
        target: index,
      });
    }
  }
  if (
    JSON.stringify(candidateNormalizedSemantic.dynamic) !==
    JSON.stringify(oracleNormalizedSemantic.dynamic)
  ) {
    add({
      candidate: candidateNormalizedSemantic.dynamic,
      kind: 'dynamic-semantic-format',
      oracle: oracleNormalizedSemantic.dynamic,
    });
  }
  for (const field of [
    'activeRole',
    'bodyScrollWidth',
    'clientWidth',
    'fontReady',
    'height',
    'scrollWidth',
    'theme',
    'width',
  ]) {
    if (candidate.document[field] !== oracle.document[field]) {
      add({
        candidate: candidate.document[field],
        field,
        kind: 'document',
        oracle: oracle.document[field],
      });
    }
  }
  if (candidate.landmarks.length !== oracle.landmarks.length) {
    add({
      candidateCount: candidate.landmarks.length,
      kind: 'landmarks',
      oracleCount: oracle.landmarks.length,
    });
  }
  for (
    let index = 0;
    index < Math.min(candidate.landmarks.length, oracle.landmarks.length);
    index += 1
  ) {
    if (candidate.landmarks[index].role !== oracle.landmarks[index].role) {
      add({
        candidate: candidate.landmarks[index].role,
        kind: 'landmark-role',
        oracle: oracle.landmarks[index].role,
        target: index,
      });
    }
    compareBox(
      candidate.landmarks[index].box,
      oracle.landmarks[index].box,
      `landmark:${index}`,
      differences,
    );
  }
  const commonClasses = Object.keys(candidate.classFacts)
    .filter((token) => Object.hasOwn(oracle.classFacts, token))
    .sort();
  for (const token of commonClasses) {
    const left = candidate.classFacts[token];
    const right = oracle.classFacts[token];
    if (left.count !== right.count) {
      add({
        candidate: left.count,
        kind: 'class-count',
        oracle: right.count,
        target: token,
      });
    }
    for (
      let index = 0;
      index < Math.min(left.facts.length, right.facts.length);
      index += 1
    ) {
      compareBox(
        left.facts[index].box,
        right.facts[index].box,
        `${token}:${index}`,
        differences,
      );
      for (const property of STYLE_PROPERTIES) {
        if (
          left.facts[index].styles[property] !==
          right.facts[index].styles[property]
        ) {
          add({
            candidate: left.facts[index].styles[property],
            kind: 'style',
            oracle: right.facts[index].styles[property],
            property,
            target: `${token}:${index}`,
          });
        }
      }
      if (differences.length >= MAX_REPORTED_DIFFERENCES) break;
    }
    if (differences.length >= MAX_REPORTED_DIFFERENCES) break;
  }
  const candidateExceptions = new Map(
    candidate.exceptionSurfaces.map((surface) => [surface.id, surface]),
  );
  const oracleExceptions = new Map(
    oracle.exceptionSurfaces.map((surface) => [surface.id, surface]),
  );
  for (const exceptionId of new Set([
    ...candidateExceptions.keys(),
    ...oracleExceptions.keys(),
  ])) {
    const left = candidateExceptions.get(exceptionId);
    const right = oracleExceptions.get(exceptionId);
    if (!left || !right) {
      add({
        candidate: Boolean(left),
        kind: 'exception-registry-surface',
        oracle: Boolean(right),
        target: exceptionId,
      });
      continue;
    }
    if (
      left.selector !== right.selector ||
      left.classification !== right.classification ||
      JSON.stringify(left.properties) !== JSON.stringify(right.properties)
    ) {
      add({
        candidate: left,
        kind: 'exception-registry-identity',
        oracle: right,
        target: exceptionId,
      });
      continue;
    }
    if (left.classification === 'dynamic-data') {
      if (left.surfaces.length !== 1 || right.surfaces.length !== 1) {
        add({
          candidate: left.surfaces.length,
          kind: 'dynamic-exception-root-count',
          oracle: right.surfaces.length,
          target: exceptionId,
        });
      } else {
        compareDynamicSurface(
          left.surfaces[0],
          right.surfaces[0],
          exceptionId,
          differences,
          add,
        );
      }
    } else {
      if (left.surfaces.length > 1 || right.surfaces.length > 1) {
        add({
          candidate: left.surfaces.length,
          kind: 'approved-addition-root-count',
          oracle: right.surfaces.length,
          target: exceptionId,
        });
      }
      if (left.surfaces.length === 1 && right.surfaces.length === 1) {
        compareDynamicSurface(
          left.surfaces[0],
          right.surfaces[0],
          exceptionId,
          differences,
          add,
        );
      }
    }
    if (differences.length >= MAX_REPORTED_DIFFERENCES) break;
  }
  return Object.freeze({
    commonClassCount: commonClasses.length,
    differences: Object.freeze(differences.slice(0, MAX_REPORTED_DIFFERENCES)),
    matched: differences.length === 0,
  });
}

async function pixelDifference(page, candidatePng, oraclePng) {
  const utility = await page.context().newPage();
  try {
    await utility.setContent('<!doctype html><title>acceptance pixel comparator</title>');
    return await utility.evaluate(
      async ({ candidate, oracle }) => {
        const read = (source) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = `data:image/png;base64,${source}`;
          });
        const [left, right] = await Promise.all([read(candidate), read(oracle)]);
        if (
          left.naturalWidth !== right.naturalWidth ||
          left.naturalHeight !== right.naturalHeight
        ) {
          return {
            dimensionsMatch: false,
            left: [left.naturalWidth, left.naturalHeight],
            right: [right.naturalWidth, right.naturalHeight],
          };
        }
        const width = left.naturalWidth;
        const height = left.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(left, 0, 0);
        const leftData = context.getImageData(0, 0, width, height).data;
        context.clearRect(0, 0, width, height);
        context.drawImage(right, 0, 0);
        const rightData = context.getImageData(0, 0, width, height).data;
        const difference = context.createImageData(width, height);
        let differentPixels = 0;
        let maxColorDelta = 0;
        for (let index = 0; index < leftData.length; index += 4) {
          let delta = 0;
          for (let channel = 0; channel < 4; channel += 1) {
            delta = Math.max(
              delta,
              Math.abs(leftData[index + channel] - rightData[index + channel]),
            );
          }
          maxColorDelta = Math.max(maxColorDelta, delta);
          if (delta > 0) {
            differentPixels += 1;
            difference.data[index] = 255;
            difference.data[index + 1] = 0;
            difference.data[index + 2] = 0;
            difference.data[index + 3] = Math.max(80, delta);
          }
        }
        context.putImageData(difference, 0, 0);
        return {
          differentPixelRatio: differentPixels / (width * height),
          differentPixels,
          dimensionsMatch: true,
          height,
          maxColorDelta,
          png: canvas.toDataURL('image/png').split(',')[1],
          totalPixels: width * height,
          width,
        };
      },
      {
        candidate: candidatePng.toString('base64'),
        oracle: oraclePng.toString('base64'),
      },
    );
  } finally {
    await utility.close();
  }
}

async function installRectangularMasks(
  candidatePage,
  oraclePage,
  exceptionEntries,
) {
  const rectangles = [];
  for (const entry of exceptionEntries.filter((candidate) =>
    candidate.properties.includes('content-pixels'),
  )) {
    for (const [kind, page] of [
      ['candidate', candidatePage],
      ['oracle', oraclePage],
    ]) {
      const selector =
        kind === 'candidate' &&
        entry.id === 'person-dynamic-evidence' &&
        page.viewportSize()?.width < 780
          ? '.person-detail-drawer'
          : kind === 'oracle'
            ? entry.oracleSelector
            : entry.selector;
      const boxes = await page.locator(selector).evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return {
            height: Math.round(box.height * 10) / 10,
            width: Math.round(box.width * 10) / 10,
            x: Math.round(box.x * 10) / 10,
            y: Math.round(box.y * 10) / 10,
          };
        }),
      );
      rectangles.push(...boxes);
    }
  }
  const unique = [
    ...new Map(
      rectangles.map((rectangle) => [JSON.stringify(rectangle), rectangle]),
    ).values(),
  ];
  const install = (page) =>
    page.evaluate((maskRectangles) => {
      for (const [index, rectangle] of maskRectangles.entries()) {
        const mask = document.createElement('div');
        mask.dataset.acceptancePixelMask = String(index);
        Object.assign(mask.style, {
          background: '#ff00ff',
          height: `${rectangle.height}px`,
          left: `${rectangle.x}px`,
          margin: '0',
          padding: '0',
          pointerEvents: 'none',
          position: 'fixed',
          top: `${rectangle.y}px`,
          width: `${rectangle.width}px`,
          zIndex: '2147483647',
        });
        document.documentElement.append(mask);
      }
    }, unique);
  await Promise.all([install(candidatePage), install(oraclePage)]);
  return async () => {
    await Promise.all(
      [candidatePage, oraclePage].map((page) =>
        page
          .locator('[data-acceptance-pixel-mask]')
          .evaluateAll((elements) => elements.forEach((element) => element.remove()))
          .catch(() => {}),
      ),
    );
  };
}

export function assertScreenshotDifference(pixels, threshold) {
  if (
    pixels === null ||
    typeof pixels !== 'object' ||
    pixels.dimensionsMatch !== true ||
    typeof pixels.differentPixelRatio !== 'number' ||
    typeof pixels.maxColorDelta !== 'number'
  ) {
    fail('paired screenshot evidence is incomplete', { pixels, threshold });
  }
  const matched =
    pixels.differentPixelRatio <= threshold.maxDifferentPixelRatio &&
    pixels.maxColorDelta <= threshold.maxColorDelta;
  if (!matched) {
    fail('paired screenshot pixels exceed the closed threshold', {
      pixels,
      threshold,
    });
  }
  return true;
}

export function assertExceptionSurfaceCoverage(candidate, oracle) {
  for (const left of candidate.exceptionSurfaces) {
    const right = oracle.exceptionSurfaces.find((entry) => entry.id === left.id);
    if (!right) fail(`oracle exception surface ${left.id} is unmatched`);
    if (
      left.classification === 'dynamic-data' &&
      (left.surfaces.length !== 1 || right.surfaces.length !== 1)
    ) {
      fail(`dynamic exception ${left.id} must resolve one root on both pages`, {
        candidate: left.surfaces.length,
        oracle: right.surfaces.length,
      });
    }
    if (
      left.classification === 'approved-addition' &&
      (left.surfaces.length !== 1 || right.surfaces.length !== 0)
    ) {
      fail(
        `approved addition ${left.id} must resolve one candidate root and no oracle root`,
        {
          candidate: left.surfaces.length,
          oracle: right.surfaces.length,
        },
      );
    }
    if (left.classification === 'approved-addition') {
      if (
        !candidate.semantic.some(
          (entry) =>
            entry.exceptionClassification === 'approved-addition' &&
            entry.exceptionId === left.id &&
            entry.role,
        )
      ) {
        fail(
          `approved addition ${left.id} has no exact semantic behavior evidence`,
        );
      }
      for (const [side, snapshot, registryEntry] of [
        ['candidate', candidate, left],
        ['oracle', oracle, right],
      ]) {
        for (const surface of registryEntry.surfaces) {
          const viewportArea =
            snapshot.document.width * snapshot.document.height;
          const surfaceArea = surface.box.width * surface.box.height;
          if (
            viewportArea <= 0 ||
            surfaceArea / viewportArea > MAX_APPROVED_ADDITION_AREA_RATIO
          ) {
            fail(
              `${side} exception ${left.id} expanded beyond the bounded rectangle`,
              { surfaceArea, viewportArea },
            );
          }
        }
      }
    }
  }
}

function writeExclusive(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { mode: 0o700, recursive: true });
  fs.writeFileSync(filePath, bytes, { flag: 'wx', mode: 0o600 });
}

function normalizeLoadingGuard(loadingGuard) {
  if (loadingGuard === undefined) return null;
  if (
    loadingGuard === null ||
    typeof loadingGuard !== 'object' ||
    !['candidate', 'oracle'].every(
      (side) =>
        Array.isArray(loadingGuard[side]) &&
        loadingGuard[side].length > 0 &&
        loadingGuard[side].every(
          (selector) =>
            typeof selector === 'string' &&
            selector.length > 0 &&
            selector.length <= 256,
        ),
    )
  ) {
    fail('oracle comparison loading guard is malformed');
  }
  return Object.freeze({
    candidate: Object.freeze([...loadingGuard.candidate]),
    oracle: Object.freeze([...loadingGuard.oracle]),
  });
}

async function captureLoadingCheckpoint(
  candidatePage,
  oraclePage,
  guard,
  checkpoint,
  expectedMotion,
) {
  if (!guard) return null;
  const inspect = (page, selectors) =>
    page.evaluate((accepted) => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const matched = accepted.filter((selector) =>
        [...document.querySelectorAll(selector)].some(visible),
      );
      const toMilliseconds = (value) => {
        const normalized = value.trim();
        if (normalized.endsWith('ms')) return Number.parseFloat(normalized);
        if (normalized.endsWith('s')) {
          return Number.parseFloat(normalized) * 1_000;
        }
        return 0;
      };
      let infinite = false;
      let maxDurationMs = 0;
      const roots = [
        ...new Set(
          matched.flatMap((selector) => [
            ...document.querySelectorAll(selector),
          ]),
        ),
      ];
      for (const element of roots.flatMap((root) => [
        root,
        ...root.querySelectorAll('*'),
      ])) {
        const style = getComputedStyle(element);
        const durations = [
          ...style.transitionDuration.split(','),
          ...(style.animationName === 'none'
            ? []
            : style.animationDuration.split(',')),
        ].map(toMilliseconds);
        maxDurationMs = Math.max(maxDurationMs, ...durations, 0);
        infinite ||= style.animationIterationCount
          .split(',')
          .some((value) => value.trim() === 'infinite');
      }
      return { infinite, matched, maxDurationMs };
    }, selectors);
  const [candidateFacts, oracleFacts] = await Promise.all([
    inspect(candidatePage, guard.candidate),
    inspect(oraclePage, guard.oracle),
  ]);
  if (
    candidateFacts.matched.length === 0 ||
    oracleFacts.matched.length === 0
  ) {
    fail(`paired loading state escaped before ${checkpoint}`, {
      candidate: candidateFacts.matched,
      checkpoint,
      oracle: oracleFacts.matched,
    });
  }
  const motionResult = (side, facts) => {
    const suppressed =
      facts.maxDurationMs <= 1 && facts.infinite === false;
    if (
      (expectedMotion === 'reduced' && !suppressed) ||
      (expectedMotion === 'default' &&
        (suppressed || facts.maxDurationMs <= 1))
    ) {
      fail(`${side} loading motion did not honor ${expectedMotion}`, {
        checkpoint,
        facts,
      });
    }
    return expectedMotion === 'reduced' ? 'suppressed' : 'active';
  };
  return Object.freeze({
    candidate: Object.freeze(candidateFacts.matched),
    checkpoint,
    motion: Object.freeze({
      candidate: motionResult('candidate', candidateFacts),
      oracle: motionResult('oracle', oracleFacts),
    }),
    oracle: Object.freeze(oracleFacts.matched),
  });
}

export async function captureOracleComparison({
  candidatePage,
  cellId,
  exceptionRegistry,
  loadingGuard,
  motion,
  oraclePage,
  route,
  runRoot,
  scenarioId,
  states,
}) {
  if (
    typeof scenarioId !== 'string' ||
    !/^[a-z][a-z0-9-]{1,63}$/u.test(scenarioId)
  ) {
    fail('oracle comparison scenario id is not one closed identifier');
  }
  const exceptionEntries = compileOracleExceptionEntries(
    exceptionRegistry,
    route,
    states,
  );
  const guard = normalizeLoadingGuard(loadingGuard);
  const loadingCheckpoints = [];
  const checkpoint = async (id) => {
    const result = await captureLoadingCheckpoint(
      candidatePage,
      oraclePage,
      guard,
      id,
      motion,
    );
    if (result) loadingCheckpoints.push(result);
  };
  await checkpoint('before-fonts');
  await Promise.all([
    candidatePage.evaluate(() => document.fonts.ready),
    oraclePage.evaluate(() => document.fonts.ready),
  ]);
  await checkpoint('after-fonts');
  const [candidateSnapshot, oracleSnapshot] = await Promise.all([
    snapshotPage(candidatePage, exceptionEntries, 'candidate'),
    snapshotPage(oraclePage, exceptionEntries, 'oracle'),
  ]);
  await checkpoint('after-snapshot');
  assertExceptionSurfaceCoverage(candidateSnapshot, oracleSnapshot);
  const structural = compareSnapshotFacts(candidateSnapshot, oracleSnapshot);
  const base = `browser/cells/${cellId}/${scenarioId}`;
  const candidatePath = resolveRunRelative(
    runRoot,
    `${base}.candidate.png`,
    'candidate screenshot path',
  );
  const oraclePath = resolveRunRelative(
    runRoot,
    `${base}.oracle.png`,
    'oracle screenshot path',
  );
  const removeMasks = await installRectangularMasks(
    candidatePage,
    oraclePage,
    exceptionEntries,
  );
  let candidatePng;
  let oraclePng;
  try {
    await checkpoint('before-screenshot');
    [candidatePng, oraclePng] = await Promise.all([
      candidatePage.screenshot({
        animations: 'disabled',
        caret: 'hide',
      }),
      oraclePage.screenshot({
        animations: 'disabled',
        caret: 'hide',
      }),
    ]);
    await checkpoint('after-screenshot');
  } finally {
    await removeMasks();
  }
  writeExclusive(candidatePath, candidatePng);
  writeExclusive(oraclePath, oraclePng);
  const pixels = await pixelDifference(candidatePage, candidatePng, oraclePng);
  let diffPath = null;
  if (pixels.dimensionsMatch) {
    diffPath = resolveRunRelative(
      runRoot,
      `${base}.difference.png`,
      'difference screenshot path',
    );
    writeExclusive(diffPath, Buffer.from(pixels.png, 'base64'));
    delete pixels.png;
  }
  const threshold = exceptionRegistry.screenshotThreshold;
  let screenshotMatched = true;
  try {
    assertScreenshotDifference(pixels, threshold);
  } catch {
    screenshotMatched = false;
  }
  const screenshots = [];
  for (const [kind, absolute] of [
    ['candidate', candidatePath],
    ['oracle', oraclePath],
    ['difference', diffPath],
  ]) {
    if (!absolute) continue;
    screenshots.push({
      kind,
      path: path.relative(runRoot, absolute).split(path.sep).join('/'),
      sha256: await sha256File(absolute),
    });
  }
  const evidence = Object.freeze({
    candidate: candidateSnapshot,
    exceptions: Object.freeze(
      exceptionEntries.map((entry) => ({
        classification: entry.classification,
        id: entry.id,
        properties: entry.properties,
        selector: entry.selector,
      })),
    ),
    oracle: oracleSnapshot,
    ...(guard
      ? {
          loadingState: Object.freeze({
            checkpoints: Object.freeze(loadingCheckpoints),
            guard,
            preference: motion,
          }),
        }
      : {}),
    pixels: Object.freeze({ ...pixels }),
    route,
    scenarioId,
    screenshots: Object.freeze(screenshots),
    states: Object.freeze([...states]),
    structural,
    threshold: Object.freeze({ ...threshold }),
  });
  if (!structural.matched || !screenshotMatched) {
    fail(`oracle comparison failed for ${route} in ${cellId}`, evidence);
  }
  return evidence;
}

export function assertCandidateAuditEvidence({
  actions,
  audit,
  route,
  width,
}) {
  if (
    !audit ||
    !Array.isArray(audit.accessibleNameFailures) ||
    !Array.isArray(audit.duplicateIds) ||
    !Array.isArray(audit.scrollOwners) ||
    !Array.isArray(audit.scrollViolations) ||
    !audit.outerScrollOwner
  ) {
    fail('candidate audit evidence is incomplete', { actions, audit });
  }
  if (
    audit.accessibleNameFailures.length > 0 ||
    audit.documentOverflowPx > 0 ||
    audit.duplicateIds.length > 0 ||
    !audit.motionMatches ||
    audit.scrollViolations.length > 0 ||
    !['HTML', 'BODY'].includes(audit.outerScrollOwner.tag)
  ) {
    fail('candidate accessibility/overflow/scroll audit failed', audit);
  }
  if (
    !actions?.focusVisible?.pass ||
    actions.focusVisible.before === undefined ||
    actions.focusVisible.after === undefined ||
    !actions.queryEscapeAndReturn ||
    !actions.tooltip?.targetFound ||
    !actions.tooltip.hoverOpened ||
    !actions.tooltip.keyboardOpened ||
    !actions.tooltip.clickOpened ||
    !actions.tooltip.escapeClosed ||
    !actions.tooltip.focusStayedAfterEscape ||
    !actions.tooltip.blurClosed
  ) {
    fail('candidate focus/tooltip interaction evidence failed', {
      actions,
      audit,
    });
  }
  if (route === '/co-star') {
    if (
      !actions.responsive ||
      (width < 780 &&
        (!actions.responsive.mobileEntryVisible ||
          actions.responsive.railVisible ||
          !actions.drawer?.backgroundOwner ||
          !actions.drawer.backgroundTabBlocked ||
          !actions.drawer.escapeClosed ||
          !actions.drawer.escapeFocusReturned ||
          !actions.drawer.focusTrapped ||
          !actions.drawer.maskClosed ||
          !actions.drawer.maskFocusReturned ||
          !actions.drawer.scrollContained)) ||
      (width >= 780 &&
        (actions.responsive.mobileEntryVisible ||
          !actions.responsive.railVisible ||
          actions.drawer !== 'not-applicable'))
    ) {
      fail('candidate responsive Drawer evidence failed', { actions, audit });
    }
  }
  if (
    route === '/ranking' &&
    ((width < 780 &&
      (!actions.personDrawer?.backgroundOwner ||
        !actions.personDrawer.backgroundTabBlocked ||
        !actions.personDrawer.escapeClosed ||
        !actions.personDrawer.escapeFocusReturned ||
        !actions.personDrawer.focusTrapped ||
        !actions.personDrawer.maskClosed ||
        !actions.personDrawer.maskFocusReturned ||
        !actions.personDrawer.scrollContained)) ||
      (width >= 780 && actions.personDrawer !== 'not-applicable'))
  ) {
    fail('candidate person Drawer evidence failed', { actions, audit });
  }
  return true;
}

async function firstVisibleLocator(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  fail(`required visible ${label} is missing`);
}

const NORMALIZED_ACTION_IDS = Object.freeze([
  'query-open',
  'tooltip-escape',
  'query-escape-return',
  'drawer-escape-return',
  'view',
  'sort',
  'page',
  'share',
  'theme-round-trip',
  'mode-round-trip',
]);
const MOTION_OBSERVATION_IDS = Object.freeze([
  'query-panel',
  'tooltip',
  'drawer',
  'direction',
]);
const THEME_RESULT_CHECKPOINT_IDS = Object.freeze([
  'before',
  'toggle-alternate',
  'toggle-restored',
  'after',
]);
const THEME_PERSISTENCE_CHECKPOINT_IDS = Object.freeze([
  'persistence-alternate',
  'reload-alternate',
  'persistence-restored',
  'reload-restored',
]);
const THEME_STABLE_WINDOW_MS = 750;
const THEME_DELAYED_CONTROL_MS = 300;
const themeDelayedControlByBrowser = new WeakMap();

function attachThemeApiLedger(page, phase, target) {
  const entries = new WeakMap();
  const requestListener = (request) => {
    let url;
    try {
      url = new URL(request.url());
    } catch {
      target.push({
        method: request.method(),
        path: 'invalid-url',
        phase: phase(),
        status: null,
      });
      return;
    }
    if (!url.pathname.startsWith('/api/v1/')) return;
    const entry = {
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      phase: phase(),
      status: null,
    };
    entries.set(request, entry);
    target.push(entry);
  };
  const responseListener = (response) => {
    const entry = entries.get(response.request());
    if (entry) entry.status = response.status();
  };
  page.on('request', requestListener);
  page.on('response', responseListener);
  return () => {
    page.off('request', requestListener);
    page.off('response', responseListener);
  };
}

function assertThemeApiLedgerEmpty(entries) {
  if (!Array.isArray(entries) || entries.length !== 0) {
    fail('theme toggle emitted a business API request', entries);
  }
  return true;
}

export async function verifyDelayedThemeApiNegativeControl(page) {
  const browser = page.context().browser();
  if (!browser) fail('theme delayed-API control has no browser');
  if (!themeDelayedControlByBrowser.has(browser)) {
    themeDelayedControlByBrowser.set(
      browser,
      (async () => {
        const context = await browser.newContext({
          serviceWorkers: 'block',
        });
        const control = await context.newPage();
        const requests = [];
        const detach = attachThemeApiLedger(
          control,
          () => 'delayed-negative-control',
          requests,
        );
        await control.route('**/*', async (routeHandler) => {
          const url = new URL(routeHandler.request().url());
          if (url.pathname === '/__acceptance/theme-delay') {
            await routeHandler.fulfill({
              body: `<!doctype html><script>
                setTimeout(async () => {
                  await fetch('/api/v1/rankings', {
                    method: 'POST',
                    headers: {'content-type': 'application/json'},
                    body: '{}'
                  });
                  window.__acceptanceDelayedThemeRequestDone = true;
                }, ${THEME_DELAYED_CONTROL_MS});
              </script>`,
              contentType: 'text/html; charset=utf-8',
              status: 200,
            });
            return;
          }
          if (url.pathname === '/api/v1/rankings') {
            await routeHandler.fulfill({
              body: '{}',
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await routeHandler.abort('blockedbyclient');
        });
        try {
          await control.goto('http://127.0.0.1/__acceptance/theme-delay', {
            waitUntil: 'domcontentloaded',
          });
          await control.waitForFunction(
            () => window.__acceptanceDelayedThemeRequestDone === true,
          );
          await control.waitForTimeout(50);
          const expected = [
            {
              method: 'POST',
              path: '/api/v1/rankings',
              phase: 'delayed-negative-control',
              status: 200,
            },
          ];
          if (JSON.stringify(requests) !== JSON.stringify(expected)) {
            fail('theme delayed-API control was not observed exactly', requests);
          }
          let rejected = false;
          try {
            assertThemeApiLedgerEmpty(requests);
          } catch (error) {
            if (!(error instanceof OracleComparisonError)) throw error;
            rejected = true;
          }
          if (!rejected) {
            fail('theme delayed-API negative control escaped');
          }
          return Object.freeze({
            delayMs: THEME_DELAYED_CONTROL_MS,
            observed: Object.freeze({ ...requests[0] }),
            rejected,
          });
        } finally {
          detach();
          await context.close();
        }
      })(),
    );
  }
  return themeDelayedControlByBrowser.get(browser);
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('theme query contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
      )
      .join(',')}}`;
  }
  fail('theme query contains a non-JSON value');
}

function sha256Json(value) {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function canonicalToken(serialization) {
  if (typeof serialization !== 'string' || serialization.length === 0) {
    fail('theme query serialization is missing');
  }
  let value;
  try {
    value = JSON.parse(serialization);
  } catch {
    fail('theme query serialization is invalid JSON');
  }
  if (canonicalJson(value) !== serialization) {
    fail('theme query serialization is not canonical');
  }
  return `v1.${Buffer.from(serialization, 'utf8').toString('base64url')}`;
}

export function sealThemeCheckpointEvidence(raw) {
  if (raw === null || typeof raw !== 'object') {
    fail('theme checkpoint raw evidence is missing');
  }
  const evidence = { ...raw };
  delete evidence.actualSha256;
  delete evidence.comparable;
  delete evidence.comparableSha256;
  const comparable = {
    id: evidence.id,
    loadingCount: evidence.resource?.loadingCount,
    pathname: evidence.route?.pathname,
    querySummary: evidence.query?.summary,
    resourceState: evidence.resource?.state,
    theme: evidence.theme,
  };
  const actual = { comparable, ...evidence };
  return Object.freeze({
    actualSha256: sha256Json(actual),
    comparable,
    comparableSha256: sha256Json(comparable),
    ...evidence,
  });
}

export function sealThemePersistenceCheckpointEvidence(raw) {
  if (raw === null || typeof raw !== 'object') {
    fail('theme persistence checkpoint raw evidence is missing');
  }
  const evidence = { ...raw };
  delete evidence.actualSha256;
  delete evidence.comparable;
  delete evidence.comparableSha256;
  const comparable = {
    id: evidence.id,
    loadingCount: evidence.resource?.loadingCount,
    pathname: evidence.route?.pathname,
    resourceState: evidence.resource?.state,
    theme: evidence.theme,
  };
  const actual = { comparable, ...evidence };
  return Object.freeze({
    actualSha256: sha256Json(actual),
    comparable,
    comparableSha256: sha256Json(comparable),
    ...evidence,
  });
}

function assertThemeCheckpoint(
  checkpoint,
  pageKind,
  route,
  expectedId,
  expectedTheme,
) {
  if (
    checkpoint === null ||
    typeof checkpoint !== 'object' ||
    JSON.stringify(Object.keys(checkpoint).sort()) !==
      JSON.stringify(
        [
          'actualSha256',
          'comparable',
          'comparableSha256',
          'id',
          'query',
          'resource',
          'route',
          'share',
          'storage',
          'theme',
        ].sort(),
      ) ||
    checkpoint.id !== expectedId ||
    checkpoint.theme !== expectedTheme
  ) {
    fail(`theme checkpoint ${expectedId} is not exact`, checkpoint);
  }
  const routeFact = checkpoint.route;
  if (
    routeFact === null ||
    typeof routeFact !== 'object' ||
    JSON.stringify(Object.keys(routeFact).sort()) !==
      JSON.stringify(['hash', 'key', 'pathname', 'search']) ||
    routeFact.pathname !== route ||
    routeFact.key !==
      `${routeFact.pathname}${routeFact.search}${routeFact.hash}` ||
    typeof routeFact.search !== 'string' ||
    typeof routeFact.hash !== 'string'
  ) {
    fail('theme checkpoint route key is incomplete', checkpoint);
  }
  const query = checkpoint.query;
  if (
    query === null ||
    typeof query !== 'object' ||
    JSON.stringify(Object.keys(query).sort()) !==
      JSON.stringify(['appliedSerialization', 'revision', 'summary']) ||
    typeof query.summary !== 'string' ||
    query.summary.length === 0
  ) {
    fail('theme checkpoint query evidence is incomplete', checkpoint);
  }
  const share = checkpoint.share;
  if (
    share === null ||
    typeof share !== 'object' ||
    JSON.stringify(Object.keys(share).sort()) !==
      JSON.stringify(['count', 'disabled', 'target'])
  ) {
    fail('theme checkpoint share evidence is incomplete', checkpoint);
  }
  const storage = checkpoint.storage;
  if (
    storage === null ||
    typeof storage !== 'object' ||
    JSON.stringify(Object.keys(storage).sort()) !==
      JSON.stringify(['current', 'legacy', 'monitorIntact']) ||
    storage.monitorIntact !== true
  ) {
    fail('theme checkpoint storage evidence is incomplete', checkpoint);
  }
  if (pageKind === 'candidate') {
    let applied;
    let shared;
    try {
      applied = JSON.parse(query.appliedSerialization);
      shared = JSON.parse(share.target?.serialization ?? '');
    } catch {
      fail('candidate theme checkpoint query/share JSON is invalid', checkpoint);
    }
    if (
      !Number.isSafeInteger(query.revision) ||
      query.revision < 1 ||
      routeFact.hash !== '' ||
      canonicalJson(applied) !== query.appliedSerialization ||
      share.count !== 1 ||
      share.disabled !== false ||
      share.target === null ||
      typeof share.target !== 'object' ||
      JSON.stringify(Object.keys(share.target).sort()) !==
        JSON.stringify(
          ['hash', 'key', 'pathname', 'search', 'serialization', 'token'].sort(),
        ) ||
      share.target.pathname !== route ||
      share.target.key !==
        `${share.target.pathname}${share.target.search}${share.target.hash}` ||
      share.target.token !== share.target.hash.slice(3) ||
      !/^#q=v1\.[A-Za-z0-9_-]+$/u.test(share.target.hash) ||
      canonicalToken(share.target.serialization) !== share.target.token ||
      shared === null ||
      typeof shared !== 'object' ||
      Array.isArray(shared) ||
      !Object.hasOwn(shared, 'query') ||
      canonicalJson(shared.query) !== query.appliedSerialization ||
      storage.current !== expectedTheme ||
      storage.legacy !== null
    ) {
      fail('candidate theme checkpoint lost query/share/storage authority', checkpoint);
    }
  } else if (
    query.revision !== null ||
    query.appliedSerialization !== null ||
    routeFact.hash !== '' ||
    share.count !== 0 ||
    share.disabled !== null ||
    share.target !== null ||
    storage.current !== null ||
    storage.legacy !== expectedTheme
  ) {
    fail('oracle theme checkpoint lost prototype storage ownership', checkpoint);
  }
  if (
    checkpoint.resource === null ||
    typeof checkpoint.resource !== 'object' ||
    JSON.stringify(Object.keys(checkpoint.resource).sort()) !==
      JSON.stringify(['loadingCount', 'state']) ||
    checkpoint.resource.loadingCount !== 0 ||
    checkpoint.resource.state !== 'ready'
  ) {
    fail('theme checkpoint resource/loading state is not stable', checkpoint);
  }
  const expectedComparable = {
    id: expectedId,
    loadingCount: 0,
    pathname: route,
    querySummary: query.summary,
    resourceState: 'ready',
    theme: expectedTheme,
  };
  if (
    JSON.stringify(checkpoint.comparable) !==
      JSON.stringify(expectedComparable) ||
    checkpoint.comparableSha256 !== sha256Json(expectedComparable)
  ) {
    fail('theme checkpoint comparable value/digest is invalid', checkpoint);
  }
  const {
    actualSha256,
    comparableSha256,
    ...actual
  } = checkpoint;
  if (actualSha256 !== sha256Json(actual)) {
    fail('theme checkpoint actual digest is invalid', checkpoint);
  }
  return true;
}

function assertThemePersistenceCheckpoint(
  checkpoint,
  pageKind,
  route,
  expectedId,
  expectedTheme,
) {
  if (
    checkpoint === null ||
    typeof checkpoint !== 'object' ||
    JSON.stringify(Object.keys(checkpoint).sort()) !==
      JSON.stringify(
        [
          'actualSha256',
          'comparable',
          'comparableSha256',
          'id',
          'queryApplied',
          'resource',
          'route',
          'storage',
          'theme',
        ].sort(),
      ) ||
    checkpoint.id !== expectedId ||
    checkpoint.theme !== expectedTheme
  ) {
    fail(`theme persistence checkpoint ${expectedId} is not exact`, checkpoint);
  }
  const routeFact = checkpoint.route;
  const storage = checkpoint.storage;
  if (
    routeFact === null ||
    typeof routeFact !== 'object' ||
    JSON.stringify(Object.keys(routeFact).sort()) !==
      JSON.stringify(['hash', 'key', 'pathname', 'search']) ||
    routeFact.pathname !== route ||
    routeFact.hash !== '' ||
    routeFact.key !== `${routeFact.pathname}${routeFact.search}` ||
    storage === null ||
    typeof storage !== 'object' ||
    JSON.stringify(Object.keys(storage).sort()) !==
      JSON.stringify(['current', 'legacy', 'monitorIntact']) ||
    storage.monitorIntact !== true ||
    checkpoint.resource === null ||
    typeof checkpoint.resource !== 'object' ||
    JSON.stringify(Object.keys(checkpoint.resource).sort()) !==
      JSON.stringify(['loadingCount', 'state']) ||
    checkpoint.resource.loadingCount !== 0 ||
    checkpoint.resource.state !== 'stable'
  ) {
    fail('theme persistence checkpoint is incomplete or unstable', checkpoint);
  }
  if (pageKind === 'candidate') {
    if (
      checkpoint.queryApplied !== false ||
      routeFact.search !== '' ||
      storage.current !== expectedTheme ||
      storage.legacy !== null
    ) {
      fail('candidate theme persistence page lost empty-state authority', checkpoint);
    }
  } else {
    const parameters = new URLSearchParams();
    if (route === '/ranking') parameters.set('mode', 'ranking');
    if (expectedTheme === 'dark') parameters.set('theme', 'dark');
    const expectedSearch = parameters.toString()
      ? `?${parameters.toString()}`
      : '';
    if (
      checkpoint.queryApplied !== null ||
      routeFact.search !== expectedSearch ||
      storage.current !== null ||
      storage.legacy !== expectedTheme
    ) {
      fail('oracle theme persistence page lost prototype authority', checkpoint);
    }
  }
  const expectedComparable = {
    id: expectedId,
    loadingCount: 0,
    pathname: route,
    resourceState: 'stable',
    theme: expectedTheme,
  };
  if (
    JSON.stringify(checkpoint.comparable) !==
      JSON.stringify(expectedComparable) ||
    checkpoint.comparableSha256 !== sha256Json(expectedComparable)
  ) {
    fail('theme persistence comparable value/digest is invalid', checkpoint);
  }
  const { actualSha256, comparableSha256, ...actual } = checkpoint;
  if (actualSha256 !== sha256Json(actual)) {
    fail('theme persistence actual digest is invalid', checkpoint);
  }
  return true;
}

function assertTransition(step, route) {
  const transition = step.transition;
  if (transition === null || typeof transition !== 'object') {
    fail(`normalized action ${step.id} has no state transition`, step);
  }
  if (step.id === 'theme-round-trip') {
    const keys = Object.keys(transition).sort();
    if (
      JSON.stringify(keys) !==
        JSON.stringify(
          [
            'alternate',
            'apiRequests',
            'before',
            'checkpoints',
            'delayedApiNegativeControl',
            'kind',
            'pageKind',
            'persistenceApiRequests',
            'persistenceCheckpoints',
            'persistedAlternate',
            'persistedRestored',
            'restored',
            'stableWindowMs',
          ].sort(),
        ) ||
      transition.kind !== 'theme' ||
      !['candidate', 'oracle'].includes(transition.pageKind) ||
      !['dark', 'light'].includes(transition.before) ||
      !['dark', 'light'].includes(transition.alternate) ||
      transition.alternate === transition.before ||
      transition.persistedAlternate !== transition.alternate ||
      transition.restored !== transition.before ||
      transition.persistedRestored !== transition.before ||
      transition.stableWindowMs !== THEME_STABLE_WINDOW_MS ||
      !Array.isArray(transition.apiRequests) ||
      !Array.isArray(transition.checkpoints) ||
      transition.checkpoints.length !== THEME_RESULT_CHECKPOINT_IDS.length ||
      !Array.isArray(transition.persistenceCheckpoints) ||
      transition.persistenceCheckpoints.length !==
        THEME_PERSISTENCE_CHECKPOINT_IDS.length ||
      !Array.isArray(transition.persistenceApiRequests)
    ) {
      fail('normalized theme action did not persist one exact round trip', step);
    }
    assertThemeApiLedgerEmpty(transition.apiRequests);
    if (
      transition.delayedApiNegativeControl === null ||
      typeof transition.delayedApiNegativeControl !== 'object' ||
      JSON.stringify(Object.keys(transition.delayedApiNegativeControl).sort()) !==
        JSON.stringify(['delayMs', 'observed', 'rejected']) ||
      transition.delayedApiNegativeControl.delayMs !== THEME_DELAYED_CONTROL_MS ||
      transition.delayedApiNegativeControl.rejected !== true ||
      JSON.stringify(transition.delayedApiNegativeControl.observed) !==
        JSON.stringify({
          method: 'POST',
          path: '/api/v1/rankings',
          phase: 'delayed-negative-control',
          status: 200,
        })
    ) {
      fail('theme delayed-API negative control is incomplete', transition);
    }
    const themes = [
      transition.before,
      transition.alternate,
      transition.before,
      transition.before,
    ];
    for (const [index, id] of THEME_RESULT_CHECKPOINT_IDS.entries()) {
      assertThemeCheckpoint(
        transition.checkpoints[index],
        transition.pageKind,
        route,
        id,
        themes[index],
      );
    }
    const persistenceThemes = [
      transition.alternate,
      transition.alternate,
      transition.before,
      transition.before,
    ];
    for (const [index, id] of THEME_PERSISTENCE_CHECKPOINT_IDS.entries()) {
      assertThemePersistenceCheckpoint(
        transition.persistenceCheckpoints[index],
        transition.pageKind,
        route,
        id,
        persistenceThemes[index],
      );
    }
    const expectedPersistenceRequests =
      transition.pageKind === 'candidate'
        ? THEME_PERSISTENCE_CHECKPOINT_IDS.map((phase) => ({
            method: 'GET',
            path: '/api/v1/catalog',
            phase,
            status: 200,
          }))
        : [];
    if (
      JSON.stringify(transition.persistenceApiRequests) !==
      JSON.stringify(expectedPersistenceRequests)
    ) {
      fail(
        'theme persistence page emitted a non-bootstrap API request',
        transition,
      );
    }
    const baseline = transition.checkpoints[0];
    for (const checkpoint of transition.checkpoints.slice(1)) {
      let routeMatches;
      if (transition.pageKind === 'candidate') {
        routeMatches =
          JSON.stringify(checkpoint.route) === JSON.stringify(baseline.route);
      } else {
        const parameters = new URLSearchParams(baseline.route.search);
        parameters.delete('theme');
        if (checkpoint.theme === 'dark') parameters.set('theme', 'dark');
        const serialized = parameters.toString();
        const expectedSearch = serialized ? `?${serialized}` : '';
        routeMatches =
          checkpoint.route.pathname === baseline.route.pathname &&
          checkpoint.route.hash === '' &&
          checkpoint.route.search === expectedSearch &&
          checkpoint.route.key === `${checkpoint.route.pathname}${expectedSearch}`;
      }
      if (
        !routeMatches ||
        JSON.stringify(checkpoint.query) !== JSON.stringify(baseline.query) ||
        JSON.stringify(checkpoint.resource) !==
          JSON.stringify(baseline.resource) ||
        JSON.stringify(checkpoint.share) !== JSON.stringify(baseline.share)
      ) {
        fail('theme round trip changed route, query, revision, resource, or share', {
          baseline,
          checkpoint,
        });
      }
    }
    const persistenceBaseline = transition.persistenceCheckpoints[0];
    for (const checkpoint of transition.persistenceCheckpoints.slice(1)) {
      let routeMatches;
      if (transition.pageKind === 'candidate') {
        routeMatches =
          JSON.stringify(checkpoint.route) ===
          JSON.stringify(persistenceBaseline.route);
      } else {
        const parameters = new URLSearchParams();
        if (route === '/ranking') parameters.set('mode', 'ranking');
        if (checkpoint.theme === 'dark') parameters.set('theme', 'dark');
        const expectedSearch = parameters.toString()
          ? `?${parameters.toString()}`
          : '';
        routeMatches =
          checkpoint.route.pathname === route &&
          checkpoint.route.hash === '' &&
          checkpoint.route.search === expectedSearch &&
          checkpoint.route.key === `${route}${expectedSearch}`;
      }
      if (
        !routeMatches ||
        checkpoint.queryApplied !== persistenceBaseline.queryApplied ||
        JSON.stringify(checkpoint.resource) !==
          JSON.stringify(persistenceBaseline.resource)
      ) {
        fail('theme persistence reload changed route, query, or resource state', {
          checkpoint,
          persistenceBaseline,
        });
      }
    }
    return;
  }
  if (
    JSON.stringify(Object.keys(transition).sort()) !==
      JSON.stringify(['after', 'before', 'kind']) ||
    typeof transition.before !== 'string' ||
    transition.before.length === 0 ||
    typeof transition.after !== 'string' ||
    transition.after.length === 0 ||
    transition.before === transition.after
  ) {
    fail(`normalized action ${step.id} was a no-op`, step);
  }
  const expectedKind =
    step.id === 'view'
      ? route === '/ranking'
        ? 'view'
        : 'direction'
      : step.id;
  if (transition.kind !== expectedKind) {
    fail(`normalized action ${step.id} changed the wrong state`, step);
  }
}

function assertMotionEvidence(motion, route) {
  if (
    motion === null ||
    typeof motion !== 'object' ||
    !['default', 'reduced'].includes(motion.preference) ||
    !['compact', 'wide'].includes(motion.viewport) ||
    !Array.isArray(motion.observations) ||
    motion.observations.length !== MOTION_OBSERVATION_IDS.length
  ) {
    fail('normalized motion evidence is incomplete', motion);
  }
  for (const [index, id] of MOTION_OBSERVATION_IDS.entries()) {
    const observation = motion.observations[index];
    const applicable =
      (id !== 'drawer' || motion.viewport === 'compact') &&
      (id !== 'direction' || route === '/co-star');
    const expected = applicable
      ? motion.preference === 'reduced'
        ? 'suppressed'
        : 'active'
      : 'not-applicable';
    if (
      observation === null ||
      typeof observation !== 'object' ||
      JSON.stringify(Object.keys(observation).sort()) !==
        JSON.stringify(['id', 'result']) ||
      observation.id !== id ||
      observation.result !== expected
    ) {
      fail(`normalized motion observation ${id} is not exact`, motion);
    }
  }
}

export function assertNormalizedActionTrace(trace) {
  if (
    trace === null ||
    typeof trace !== 'object' ||
    trace.schemaVersion !== 1 ||
    !['/ranking', '/co-star'].includes(trace.route) ||
    !trace.motion ||
    !Array.isArray(trace.steps) ||
    trace.steps.length !== NORMALIZED_ACTION_IDS.length
  ) {
    fail('normalized action trace is incomplete', trace);
  }
  const keys = Object.keys(trace).sort();
  if (
    JSON.stringify(keys) !==
    JSON.stringify(['motion', 'route', 'schemaVersion', 'steps'])
  ) {
    fail('normalized action trace contains an open field', trace);
  }
  assertMotionEvidence(trace.motion, trace.route);
  for (const [index, expectedId] of NORMALIZED_ACTION_IDS.entries()) {
    const step = trace.steps[index];
    const hasTransition = ['page', 'sort', 'theme-round-trip', 'view'].includes(
      expectedId,
    );
    if (
      step === null ||
      typeof step !== 'object' ||
      JSON.stringify(Object.keys(step).sort()) !==
        JSON.stringify(
          hasTransition ? ['id', 'result', 'transition'] : ['id', 'result'],
        ) ||
      step.id !== expectedId ||
      step.result !== 'pass'
    ) {
      fail(`normalized action trace step ${expectedId} is not exact`, trace);
    }
    if (hasTransition) assertTransition(step, trace.route);
  }
  return true;
}

export function assertNormalizedActionTracePair(candidate, oracle) {
  assertNormalizedActionTrace(candidate);
  assertNormalizedActionTrace(oracle);
  const normalizePair = (trace) => ({
    ...trace,
    steps: trace.steps.map((step) =>
      step.id === 'theme-round-trip'
        ? {
            ...step,
            transition: {
              alternate: step.transition.alternate,
              before: step.transition.before,
              checkpoints: step.transition.checkpoints.map((checkpoint) => ({
                comparable: checkpoint.comparable,
                comparableSha256: checkpoint.comparableSha256,
              })),
              delayedApiNegativeControl:
                step.transition.delayedApiNegativeControl,
              kind: step.transition.kind,
              persistenceCheckpoints:
                step.transition.persistenceCheckpoints.map((checkpoint) => ({
                  comparable: checkpoint.comparable,
                  comparableSha256: checkpoint.comparableSha256,
                })),
              persistedAlternate: step.transition.persistedAlternate,
              persistedRestored: step.transition.persistedRestored,
              restored: step.transition.restored,
              stableWindowMs: step.transition.stableWindowMs,
            },
          }
        : step,
    ),
  });
  if (
    candidate.steps.find((step) => step.id === 'theme-round-trip')?.transition
      .pageKind !== 'candidate' ||
    oracle.steps.find((step) => step.id === 'theme-round-trip')?.transition
      .pageKind !== 'oracle' ||
    JSON.stringify(normalizePair(candidate)) !==
      JSON.stringify(normalizePair(oracle))
  ) {
    fail('candidate and oracle normalized action traces differ', {
      candidate,
      oracle,
    });
  }
  return true;
}

async function keyboardActivate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

async function startMotionProbe(page, selectors) {
  await page.evaluate((acceptedSelectors) => {
    const toMilliseconds = (value) => {
      const normalized = value.trim();
      if (normalized.endsWith('ms')) return Number.parseFloat(normalized);
      if (normalized.endsWith('s')) {
        return Number.parseFloat(normalized) * 1_000;
      }
      return 0;
    };
    const totals = (durations, delays) => {
      const durationValues = durations.split(',').map(toMilliseconds);
      const delayValues = delays.split(',').map(toMilliseconds);
      const count = Math.max(durationValues.length, delayValues.length);
      return Array.from({ length: count }, (_, index) => {
        const duration =
          durationValues[index % Math.max(1, durationValues.length)] ?? 0;
        const delay =
          delayValues[index % Math.max(1, delayValues.length)] ?? 0;
        return Math.max(0, duration + delay);
      });
    };
    const facts = {
      infinite: false,
      maxDurationMs: 0,
      mutationCount: 0,
      observedCount: 0,
    };
    const record = () => {
      const elements = [
        ...new Set(
          acceptedSelectors.flatMap((selector) => [
            ...document.querySelectorAll(selector),
          ]),
        ),
      ];
      facts.observedCount = Math.max(facts.observedCount, elements.length);
      for (const element of elements) {
        const style = getComputedStyle(element);
        const transitionTotals = totals(
          style.transitionDuration,
          style.transitionDelay,
        );
        const animationTotals =
          style.animationName === 'none'
            ? [0]
            : totals(style.animationDuration, style.animationDelay);
        facts.maxDurationMs = Math.max(
          facts.maxDurationMs,
          ...transitionTotals,
          ...animationTotals,
        );
        facts.infinite ||= style.animationIterationCount
          .split(',')
          .some((value) => value.trim() === 'infinite');
      }
    };
    const observer = new MutationObserver(() => {
      facts.mutationCount += 1;
      record();
    });
    observer.observe(document.documentElement, {
      attributeFilter: [
        'aria-expanded',
        'aria-hidden',
        'aria-pressed',
        'aria-selected',
        'class',
        'style',
      ],
      attributes: true,
      childList: true,
      subtree: true,
    });
    record();
    Object.defineProperty(window, '__acceptanceMotionProbe', {
      configurable: true,
      value: {
        facts,
        finish() {
          record();
          observer.disconnect();
          return { ...facts };
        },
      },
    });
  }, selectors);
}

async function finishMotionProbe(page, expectedMotion, id) {
  const facts = await page.evaluate(() => {
    const probe = window.__acceptanceMotionProbe;
    const result = probe?.finish();
    delete window.__acceptanceMotionProbe;
    return result ?? null;
  });
  if (
    facts === null ||
    !Number.isSafeInteger(facts.observedCount) ||
    facts.observedCount < 1 ||
    !Number.isSafeInteger(facts.mutationCount) ||
    facts.mutationCount < 1 ||
    typeof facts.maxDurationMs !== 'number' ||
    !Number.isFinite(facts.maxDurationMs)
  ) {
    fail(`motion probe ${id} did not observe the real interaction`, facts);
  }
  const suppressed =
    facts.maxDurationMs <= 1 && facts.infinite === false;
  if (
    (expectedMotion === 'reduced' && !suppressed) ||
    (expectedMotion === 'default' &&
      (suppressed || facts.maxDurationMs <= 1))
  ) {
    fail(`motion probe ${id} did not honor ${expectedMotion}`, facts);
  }
  return Object.freeze({
    id,
    result: expectedMotion === 'reduced' ? 'suppressed' : 'active',
  });
}

async function waitForPendingViews(page) {
  await page.waitForFunction(() => {
    const selectors = [
      '.ranking-view-pending',
      '.candidate-row-skeletons',
      '.ranking-pagination-skeleton',
      '.workbench-state[aria-busy="true"]',
      '.query-skeleton--ranking[aria-busy="true"]',
      '.query-skeleton--co-star[aria-busy="true"]',
      '.query-result-state[aria-busy="true"]',
      '[aria-busy="true"].query-summary',
    ];
    return selectors.every(
      (selector) =>
        ![...document.querySelectorAll(selector)].some((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0 &&
            box.height > 0
          );
        }),
    );
  });
}

async function withRequiredApiResponse(page, kind, pathname, action) {
  if (kind === 'oracle') {
    await action();
    return;
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === pathname &&
      response.request().method() === 'POST',
  );
  await action();
  const response = await responsePromise;
  if (!response.ok()) {
    fail(`keyboard state transition received ${response.status()} from ${pathname}`);
  }
}

async function selectedControlLabel(locator) {
  return locator.evaluate((element) =>
    (
      element.querySelector('.n-base-selection-label')?.textContent ??
      element.textContent ??
      ''
    )
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

async function keyboardSelectNext(page, locator, kind, pathname) {
  const before = await selectedControlLabel(locator);
  await withRequiredApiResponse(page, kind, pathname, async () => {
    await locator.focus();
    await locator.press('Enter');
    const options = page.locator(
      '.n-base-select-option:not(.n-base-select-option--disabled):not(.n-base-select-option--group)',
    );
    await options.first().waitFor({ state: 'visible' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await options.first().waitFor({ state: 'hidden' });
  });
  await waitForPendingViews(page);
  const after = await selectedControlLabel(locator);
  return Object.freeze({ after, before, kind: 'sort' });
}

async function currentPageNumber(pagination) {
  const buttons = pagination.locator('button');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const text = (await button.textContent())?.trim() ?? '';
    const classes = (await button.getAttribute('class')) ?? '';
    if (
      /^\d+$/u.test(text) &&
      ((await button.getAttribute('aria-current')) === 'page' ||
        /(?:^|[-_\s])active(?:$|[-_\s])/u.test(classes) ||
        classes.includes('primary-type'))
    ) {
      return text;
    }
  }
  fail('keyboard pagination has no current page');
}

async function keyboardPage(page, kind, pathname) {
  const pagination = await firstVisibleLocator(
    page.locator('.adaptive-pagination__pages,.ranking-pagination__pages'),
    'pagination',
  );
  const before = await currentPageNumber(pagination);
  const buttons = pagination.locator('button:not([disabled])');
  const count = await buttons.count();
  let target = null;
  let targetPage = '';
  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    const text = (await candidate.textContent())?.trim() ?? '';
    if (/^\d+$/u.test(text) && text !== before) {
      target = candidate;
      targetPage = text;
      break;
    }
  }
  if (!target) fail('keyboard pagination has no alternate page');
  await withRequiredApiResponse(page, kind, pathname, () =>
    keyboardActivate(target),
  );
  await waitForPendingViews(page);
  const after = await currentPageNumber(pagination);
  if (after !== targetPage) {
    fail('keyboard pagination did not select its target page', {
      after,
      before,
      targetPage,
    });
  }
  return Object.freeze({ after, before, kind: 'page' });
}

function normalizedDensity(value) {
  if (value === '详细') return 'detailed';
  if (value === '缩略') return 'compact';
  fail(`person-detail density is outside the closed values: ${value}`);
}

async function keyboardView(page, kind) {
  const container =
    kind === 'candidate'
      ? '.person-item-browser__density'
      : '.subject-work-browser__density-toggle';
  const current = await firstVisibleLocator(
    page.locator(`${container} [role="radio"][aria-checked="true"]`),
    'current person-detail view',
  );
  const before = normalizedDensity((await current.textContent())?.trim() ?? '');
  const target = await firstVisibleLocator(
    page.locator(
      `${container} [role="radio"]:not([aria-checked="true"])`,
    ),
    'alternate person-detail view',
  );
  await keyboardActivate(target);
  await page.waitForFunction(
    (viewContainer) =>
      [...document.querySelectorAll(`${viewContainer} [role="radio"]`)].some(
        (element) =>
          element.getAttribute('aria-checked') === 'true' &&
          element.textContent?.trim() === '缩略',
      ),
    container,
  );
  await page
    .locator('.subject-work-list--compact,.character-role-list--compact')
    .first()
    .waitFor({ state: 'visible' });
  const selected = await firstVisibleLocator(
    page.locator(`${container} [role="radio"][aria-checked="true"]`),
    'selected person-detail view',
  );
  const after = normalizedDensity((await selected.textContent())?.trim() ?? '');
  return Object.freeze({ after, before, kind: 'view' });
}

function orderFromLabel(label) {
  const matched = /当前(升序|降序)/u.exec(label);
  if (!matched) fail(`sort direction label is outside the closed format: ${label}`);
  return matched[1] === '升序' ? 'asc' : 'desc';
}

async function keyboardDirection(page, kind, expectedMotion) {
  const selector =
    kind === 'candidate'
      ? '.candidate-sort-direction'
      : '.candidate-sort-direction button,.candidate-sort-direction';
  const direction = await firstVisibleLocator(
    page.locator(selector),
    `${kind} co-star direction control`,
  );
  const before = orderFromLabel((await direction.getAttribute('aria-label')) ?? '');
  await startMotionProbe(page, [
    '.candidate-sort-direction .app-icon',
    '.candidate-sort-direction.app-icon',
    '.ranking-order-button .app-icon',
  ]);
  await withRequiredApiResponse(
    page,
    kind,
    '/api/v1/candidates',
    () => keyboardActivate(direction),
  );
  await waitForPendingViews(page);
  const after = orderFromLabel((await direction.getAttribute('aria-label')) ?? '');
  const motion = await finishMotionProbe(page, expectedMotion, 'direction');
  return Object.freeze({
    motion,
    transition: Object.freeze({ after, before, kind: 'direction' }),
  });
}

async function keyboardShare(page, kind, route) {
  const share = page.getByRole('button', { name: '复制当前查询链接' });
  if (kind === 'oracle') {
    if ((await share.count()) !== 0) {
      fail('fixed oracle unexpectedly exposes the approved share addition');
    }
    return;
  }
  const target = await firstVisibleLocator(share, 'share action');
  if (!(await target.isEnabled())) fail('keyboard share action is disabled');
  await keyboardActivate(target);
  let copied = '';
  try {
    copied = await page.evaluate(() => navigator.clipboard.readText());
  } catch {
    const fallback = page.getByLabel('当前查询链接');
    if (await fallback.isVisible().catch(() => false)) {
      copied = await fallback.inputValue();
    }
  }
  const url = new URL(copied);
  if (
    url.origin !== new URL(page.url()).origin ||
    url.pathname !== route ||
    !/^#q=v1\.[A-Za-z0-9_-]+$/u.test(url.hash)
  ) {
    fail('keyboard share action did not produce a canonical route-bound URL');
  }
}

function responsiveDrawerDriver(kind, route) {
  return route === '/ranking'
    ? kind === 'candidate'
      ? {
          drawer: '#person-detail-panel[role="dialog"]',
          opener: '.ranked-person-row',
        }
      : {
          drawer: '.ranking-inspector-drawer[role="dialog"]',
          opener: '.person-row--ranking',
        }
    : kind === 'candidate'
      ? {
          drawer: '#co-star-mobile-picker',
          opener: '.co-star-mobile-entry',
        }
      : {
          drawer: '#mobile-person-picker',
          opener: '.mobile-picker-entry',
        };
}

async function keyboardDrawer(page, kind, route, width, expectedMotion) {
  if (width >= 780) {
    return Object.freeze({ id: 'drawer', result: 'not-applicable' });
  }
  const driver = responsiveDrawerDriver(kind, route);
  const opener = await firstVisibleLocator(
    page.locator(driver.opener),
    `${kind} Drawer opener`,
  );
  await startMotionProbe(page, [
    '[role="dialog"]',
    '.n-drawer',
    '.n-drawer-mask',
    '.person-detail-drawer',
  ]);
  await keyboardActivate(opener);
  const drawer = page.locator(driver.drawer);
  await drawer.waitFor({ state: 'visible' });
  const motion = await finishMotionProbe(page, expectedMotion, 'drawer');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  if (
    !(await opener.evaluate((element) => element === document.activeElement))
  ) {
    fail(`${kind} Drawer did not return keyboard focus`);
  }
  return motion;
}

async function withResponsiveControlSurface(
  page,
  kind,
  route,
  width,
  action,
) {
  if (width >= 780) return action();
  const driver =
    responsiveDrawerDriver(kind, route);
  const opener = await firstVisibleLocator(
    page.locator(driver.opener),
    `${kind} responsive control opener`,
  );
  await keyboardActivate(opener);
  const drawer = page.locator(driver.drawer);
  await drawer.waitFor({ state: 'visible' });
  try {
    return await action();
  } finally {
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
  }
}

async function captureThemeShareTarget(page, kind, route) {
  const share = page.getByRole('button', { name: '复制当前查询链接' });
  if (kind === 'oracle') {
    if ((await share.count()) !== 0) {
      fail('fixed oracle unexpectedly exposes the approved share addition');
    }
    return null;
  }
  const target = await firstVisibleLocator(share, 'theme share action');
  if (!(await target.isEnabled())) {
    fail('candidate theme share action is unexpectedly disabled');
  }
  await keyboardActivate(target);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let copied = '';
    try {
      copied = await page.evaluate(() => navigator.clipboard.readText());
    } catch {
      const fallback = page.getByLabel('当前查询链接');
      if (await fallback.isVisible().catch(() => false)) {
        copied = await fallback.inputValue();
      }
    }
    try {
      const url = new URL(copied);
      if (
        url.origin === new URL(page.url()).origin &&
        url.pathname === route &&
        /^#q=v1\.[A-Za-z0-9_-]+$/u.test(url.hash)
      ) {
        return url.toString();
      }
    } catch {
      // The asynchronous clipboard write may still be pending.
    }
    await page.waitForTimeout(25);
  }
  fail('candidate theme checkpoint did not produce its actual share target');
}

async function captureThemeCheckpoint({
  id,
  kind,
  page,
  route,
}) {
  const shareTarget = await captureThemeShareTarget(page, kind, route);
  const raw = await page.evaluate(
    ({ checkpointId, pageKind, target }) => {
      const normalize = (value) =>
        String(value ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      const canonical = (value) => {
        if (
          value === null ||
          typeof value === 'boolean' ||
          typeof value === 'number' ||
          typeof value === 'string'
        ) {
          return JSON.stringify(value);
        }
        if (Array.isArray(value)) {
          return `[${value.map((entry) => canonical(entry)).join(',')}]`;
        }
        return `{${Object.keys(value)
          .sort()
          .map(
            (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
          )
          .join(',')}}`;
      };
      const decode = (hash) => {
        const match = /^#q=(v1\.([A-Za-z0-9_-]+))$/u.exec(hash);
        if (!match) return null;
        const encoded = match[2]
          .replaceAll('-', '+')
          .replaceAll('_', '/');
        const padded = encoded.padEnd(
          encoded.length + ((4 - (encoded.length % 4)) % 4),
          '=',
        );
        const bytes = Uint8Array.from(atob(padded), (character) =>
          character.charCodeAt(0),
        );
        const serialization = new TextDecoder('utf-8', {
          fatal: true,
        }).decode(bytes);
        if (canonical(JSON.parse(serialization)) !== serialization) {
          throw new Error('share query is not canonical');
        }
        return { serialization, token: match[1] };
      };
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const routeFact = {
        hash: location.hash,
        key: `${location.pathname}${location.search}${location.hash}`,
        pathname: location.pathname,
        search: location.search,
      };
      const shareUrl = target ? new URL(target) : null;
      const targetQuery = shareUrl ? decode(shareUrl.hash) : null;
      const shareRoot = document.querySelector('.share-action');
      const shareButton = shareRoot?.querySelector('button');
      let revision = null;
      let appliedSerialization = null;
      if (pageKind === 'candidate') {
        const application = document.querySelector('#app')?.__vue_app__;
        const provides = application?._context?.provides;
        const pinia = provides
          ? Reflect.ownKeys(provides)
              .map((key) => provides[key])
              .find(
                (value) =>
                  value?._s instanceof Map && value._s.has('query'),
              )
          : null;
        const queryStore = pinia?._s.get('query');
        const value = queryStore?.revision;
        revision = Number.isSafeInteger(value) ? value : null;
        appliedSerialization = queryStore?.applied
          ? canonical(queryStore.applied)
          : null;
      }
      const loadingCount = [...document.querySelectorAll('[aria-busy="true"]')]
        .filter(visible).length;
      const readySelector =
        location.pathname === '/ranking'
          ? pageKind === 'candidate'
            ? '.ranked-person-list'
            : '.person-list--ranking'
          : pageKind === 'candidate'
            ? '.co-star-surface'
            : '.analysis-dashboard';
      const monitor = window.__acceptanceThemeStorageMonitor;
      const current = monitor?.read?.('bgmss-theme-v1') ?? null;
      const legacy =
        monitor?.read?.('bgmss-workbench-theme') ?? null;
      return {
        id: checkpointId,
        query: {
          appliedSerialization,
          revision,
          summary: normalize(
            document.querySelector('.query-summary')?.textContent,
          ),
        },
        resource: {
          loadingCount,
          state:
            loadingCount === 0 &&
            visible(document.querySelector(readySelector))
              ? 'ready'
              : 'unstable',
        },
        route: routeFact,
        share: {
          count: shareRoot ? 1 : 0,
          disabled:
            pageKind === 'candidate'
              ? Boolean(
                  shareButton?.hasAttribute('disabled') ||
                    shareButton?.getAttribute('aria-disabled') === 'true',
                )
              : null,
          target: shareUrl
            ? {
                hash: shareUrl.hash,
                key: `${shareUrl.pathname}${shareUrl.search}${shareUrl.hash}`,
                pathname: shareUrl.pathname,
                search: shareUrl.search,
                serialization: targetQuery?.serialization ?? null,
                token: targetQuery?.token ?? null,
              }
            : null,
        },
        storage: {
          current,
          legacy,
          monitorIntact:
            monitor?.kind === pageKind && monitor?.intact?.() === true,
        },
        theme: document.documentElement.dataset.theme ?? null,
      };
    },
    {
      checkpointId: id,
      pageKind: kind,
      target: shareTarget,
    },
  );
  return sealThemeCheckpointEvidence(raw);
}

async function waitForThemePersistencePage(page, kind) {
  await page.locator('.query-summary').waitFor({ state: 'visible' });
  if (kind === 'candidate') {
    await page.waitForFunction(() => {
      const application = document.querySelector('#app')?.__vue_app__;
      const provides = application?._context?.provides;
      const pinia = provides
        ? Reflect.ownKeys(provides)
            .map((key) => provides[key])
            .find(
              (value) =>
                value?._s instanceof Map &&
                value._s.has('catalog') &&
                value._s.has('query'),
            )
        : null;
      return (
        pinia?._s.get('catalog')?.phase === 'ready' &&
        pinia?._s.get('query')?.applied === null
      );
    });
  }
  await waitForPendingViews(page);
}

async function captureThemePersistenceCheckpoint({
  id,
  kind,
  page,
  route,
}) {
  const raw = await page.evaluate(
    ({ checkpointId, pageKind }) => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      };
      let queryApplied = null;
      if (pageKind === 'candidate') {
        const application = document.querySelector('#app')?.__vue_app__;
        const provides = application?._context?.provides;
        const pinia = provides
          ? Reflect.ownKeys(provides)
              .map((key) => provides[key])
              .find(
                (value) =>
                  value?._s instanceof Map && value._s.has('query'),
              )
          : null;
        const applied = pinia?._s.get('query')?.applied;
        queryApplied = applied === null ? false : applied ? true : null;
      }
      const loadingCount = [...document.querySelectorAll('[aria-busy="true"]')]
        .filter(visible).length;
      const monitor = window.__acceptanceThemeStorageMonitor;
      return {
        id: checkpointId,
        queryApplied,
        resource: {
          loadingCount,
          state:
            loadingCount === 0 &&
            visible(document.querySelector('.query-summary'))
              ? 'stable'
              : 'unstable',
        },
        route: {
          hash: location.hash,
          key: `${location.pathname}${location.search}${location.hash}`,
          pathname: location.pathname,
          search: location.search,
        },
        storage: {
          current: monitor?.read?.('bgmss-theme-v1') ?? null,
          legacy:
            monitor?.read?.('bgmss-workbench-theme') ?? null,
          monitorIntact:
            monitor?.kind === pageKind && monitor?.intact?.() === true,
        },
        theme: document.documentElement.dataset.theme ?? null,
      };
    },
    {
      checkpointId: id,
      pageKind: kind,
    },
  );
  if (raw.route.pathname !== route) {
    fail('theme persistence page left its exact route', raw);
  }
  return sealThemePersistenceCheckpointEvidence(raw);
}

async function keyboardThemeRoundTrip(page, kind, route, attachPage) {
  const before = await page.locator('html').getAttribute('data-theme');
  if (!['dark', 'light'].includes(before)) {
    fail(`${kind} theme is outside the closed values`);
  }
  if (typeof attachPage !== 'function') {
    fail(`${kind} theme persistence monitor is missing`);
  }
  const delayedApiNegativeControl =
    await verifyDelayedThemeApiNegativeControl(page);
  const apiRequests = [];
  const persistenceApiRequests = [];
  let resultPhase = 'before';
  let persistencePhase = 'persistence-alternate';
  const detachResultLedger = attachThemeApiLedger(
    page,
    () => resultPhase,
    apiRequests,
  );
  const checkpoints = [];
  const persistenceCheckpoints = [];
  const checkpoint = async (id) => {
    await waitForPendingViews(page);
    checkpoints.push(
      await captureThemeCheckpoint({
        id,
        kind,
        page,
        route,
      }),
    );
  };
  const stableCheckpoint = async (id) => {
    await page.waitForTimeout(THEME_STABLE_WINDOW_MS);
    await checkpoint(id);
  };
  const toggle = async (id, expected) => {
    resultPhase = id;
    const button = await firstVisibleLocator(
      page.getByRole('button', { name: /切换到(?:深色|浅色)模式/u }),
      `${kind} theme action`,
    );
    await keyboardActivate(button);
    await page.waitForFunction(
      (theme) => document.documentElement.dataset.theme === theme,
      expected,
    );
    await stableCheckpoint(id);
  };
  const persistenceCheckpoint = async (id, expected) => {
    persistencePhase = id;
    await waitForThemePersistencePage(persistencePage, kind);
    await persistencePage.waitForFunction(
      (theme) => document.documentElement.dataset.theme === theme,
      expected,
    );
    await persistencePage.waitForTimeout(THEME_STABLE_WINDOW_MS);
    persistenceCheckpoints.push(
      await captureThemePersistenceCheckpoint({
        id,
        kind,
        page: persistencePage,
        route,
      }),
    );
  };
  const alternate = before === 'dark' ? 'light' : 'dark';
  const persistencePage = await page.context().newPage();
  attachPage(persistencePage);
  const detachPersistenceLedger = attachThemeApiLedger(
    persistencePage,
    () => persistencePhase,
    persistenceApiRequests,
  );
  const persistenceUrl = new URL(page.url());
  persistenceUrl.pathname = route;
  persistenceUrl.hash = '';
  persistenceUrl.search = '';
  if (kind === 'oracle' && route === '/ranking') {
    persistenceUrl.searchParams.set('mode', 'ranking');
  }
  try {
    await checkpoint('before');
    await toggle('toggle-alternate', alternate);
    persistencePhase = 'persistence-alternate';
    await persistencePage.goto(persistenceUrl.toString(), {
      waitUntil: 'domcontentloaded',
    });
    await persistenceCheckpoint('persistence-alternate', alternate);
    persistencePhase = 'reload-alternate';
    await persistencePage.reload({ waitUntil: 'domcontentloaded' });
    await persistenceCheckpoint('reload-alternate', alternate);
    await toggle('toggle-restored', before);
    persistencePhase = 'persistence-restored';
    await persistencePage.goto(persistenceUrl.toString(), {
      waitUntil: 'domcontentloaded',
    });
    await persistenceCheckpoint('persistence-restored', before);
    persistencePhase = 'reload-restored';
    await persistencePage.reload({ waitUntil: 'domcontentloaded' });
    await persistenceCheckpoint('reload-restored', before);
    resultPhase = 'after';
    await stableCheckpoint('after');
  } finally {
    detachResultLedger();
    detachPersistenceLedger();
    await persistencePage.close();
  }
  const persistedAlternate =
    persistenceCheckpoints.find((entry) => entry.id === 'reload-alternate')
      ?.theme ?? null;
  const persistedRestored =
    persistenceCheckpoints.find((entry) => entry.id === 'reload-restored')
      ?.theme ?? null;
  return Object.freeze({
    alternate,
    apiRequests: Object.freeze(
      apiRequests.map((entry) => Object.freeze({ ...entry })),
    ),
    before,
    checkpoints: Object.freeze(checkpoints),
    delayedApiNegativeControl,
    kind: 'theme',
    pageKind: kind,
    persistenceApiRequests: Object.freeze(
      persistenceApiRequests.map((entry) => Object.freeze({ ...entry })),
    ),
    persistenceCheckpoints: Object.freeze(persistenceCheckpoints),
    persistedAlternate,
    persistedRestored,
    restored: before,
    stableWindowMs: THEME_STABLE_WINDOW_MS,
  });
}

async function keyboardModeRoundTrip(page, route) {
  const currentName = route === '/ranking' ? '人物排行' : '共演分析';
  const alternateName = route === '/ranking' ? '共演分析' : '人物排行';
  const current = page.getByRole('tab', { name: currentName });
  await current.focus();
  await page.keyboard.press(route === '/ranking' ? 'ArrowRight' : 'ArrowLeft');
  await page
    .getByRole('tab', { name: alternateName })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('[role="tab"]')].some(
        (element) =>
          element.textContent?.includes(name) &&
          element.getAttribute('aria-selected') === 'true',
      ),
    alternateName,
  );
  const alternate = page.getByRole('tab', { name: alternateName });
  await alternate.focus();
  await page.keyboard.press(route === '/ranking' ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('[role="tab"]')].some(
        (element) =>
          element.textContent?.includes(name) &&
          element.getAttribute('aria-selected') === 'true',
      ),
    currentName,
  );
  await waitForPendingViews(page);
}

export async function captureNormalizedActionTrace({
  attachPage,
  kind,
  motion,
  page,
  route,
  width,
}) {
  if (
    !['candidate', 'oracle'].includes(kind) ||
    !['default', 'reduced'].includes(motion) ||
    !['/ranking', '/co-star'].includes(route) ||
    ![360, 390, 779, 780, 1024, 1440].includes(width)
  ) {
    fail('normalized action trace driver is outside the closed matrix');
  }
  const steps = [];
  const pass = (id, transition) =>
    steps.push(
      Object.freeze({
        id,
        result: 'pass',
        ...(transition ? { transition } : {}),
      }),
    );
  const motionObservations = [];
  const summary = await firstVisibleLocator(
    page.locator('.query-summary'),
    `${kind} query summary`,
  );
  await startMotionProbe(page, [
    '.query-panel-enter-active',
    '[class*="query-panel-enter-active"]',
  ]);
  await keyboardActivate(summary);
  await page.locator('#query-editor').waitFor({ state: 'visible' });
  motionObservations.push(
    await finishMotionProbe(page, motion, 'query-panel'),
  );
  pass('query-open');
  const tooltip = await firstVisibleLocator(
    page.locator(
      '.field-help-trigger,.query-option-help,.partners-metric-info,.stat-evidence__trigger',
    ),
    `${kind} tooltip trigger`,
  );
  await startMotionProbe(page, [
    '.n-popover',
    '.n-tooltip',
    '.v-binder-follower-content',
    '.fade-in-scale-up-transition-enter-active',
    '.fade-in-transition-enter-active',
  ]);
  await tooltip.focus();
  await waitExpanded(tooltip, true);
  motionObservations.push(await finishMotionProbe(page, motion, 'tooltip'));
  await tooltip.press('Escape');
  await waitExpanded(tooltip, false);
  if (!(await tooltip.evaluate((element) => element === document.activeElement))) {
    fail(`${kind} tooltip Escape lost focus`);
  }
  pass('tooltip-escape');
  await page.keyboard.press('Escape');
  await page.locator('#query-editor').waitFor({ state: 'hidden' });
  if (!(await summary.evaluate((element) => element === document.activeElement))) {
    fail(`${kind} query Escape did not return focus`);
  }
  pass('query-escape-return');
  motionObservations.push(
    await keyboardDrawer(page, kind, route, width, motion),
  );
  pass('drawer-escape-return');
  let viewTransition;
  let sortTransition;
  let pageTransition;
  let directionMotion = Object.freeze({
    id: 'direction',
    result: 'not-applicable',
  });
  const apiPath =
    route === '/ranking' ? '/api/v1/rankings' : '/api/v1/candidates';
  if (route === '/ranking') {
    viewTransition = await withResponsiveControlSurface(
      page,
      kind,
      route,
      width,
      () => keyboardView(page, kind),
    );
    const sort = await firstVisibleLocator(
      page.getByLabel('人物排序规则'),
      `${kind} sort control`,
    );
    sortTransition = await keyboardSelectNext(
      page,
      sort,
      kind,
      apiPath,
    );
    pageTransition = await keyboardPage(page, kind, apiPath);
  } else {
    const result = await withResponsiveControlSurface(
      page,
      kind,
      route,
      width,
      async () => {
        const direction = await keyboardDirection(page, kind, motion);
        const sort = await firstVisibleLocator(
          page.getByLabel('候选人物排序规则'),
          `${kind} sort control`,
        );
        const sortResult = await keyboardSelectNext(
          page,
          sort,
          kind,
          apiPath,
        );
        const pageResult = await keyboardPage(page, kind, apiPath);
        return { direction, pageResult, sortResult };
      },
    );
    viewTransition = result.direction.transition;
    directionMotion = result.direction.motion;
    sortTransition = result.sortResult;
    pageTransition = result.pageResult;
  }
  motionObservations.push(directionMotion);
  pass('view', viewTransition);
  pass('sort', sortTransition);
  pass('page', pageTransition);
  await keyboardShare(page, kind, route);
  pass('share');
  pass(
    'theme-round-trip',
    await keyboardThemeRoundTrip(page, kind, route, attachPage),
  );
  await keyboardModeRoundTrip(page, route);
  pass('mode-round-trip');
  const trace = Object.freeze({
    motion: Object.freeze({
      observations: Object.freeze(motionObservations),
      preference: motion,
      viewport: width < 780 ? 'compact' : 'wide',
    }),
    route,
    schemaVersion: 1,
    steps: Object.freeze(steps),
  });
  assertNormalizedActionTrace(trace);
  return trace;
}

async function waitExpanded(locator, expanded) {
  await locator.page().waitForFunction(
    ({ expected, selector }) => {
      const element = document.querySelector(selector);
      return element?.getAttribute('aria-expanded') === expected;
    },
    {
      expected: expanded ? 'true' : 'false',
      selector: await locator.evaluate((element) => {
        const token = `acceptance-tooltip-${crypto.randomUUID()}`;
        element.setAttribute('data-acceptance-tooltip-target', token);
        return `[data-acceptance-tooltip-target="${token}"]`;
      }),
    },
  );
}

async function auditTooltip(page) {
  const target = await firstVisibleLocator(
    page.locator(
      '.field-help-trigger,.query-option-help,.partners-metric-info,.stat-evidence__trigger',
    ),
    'tooltip trigger',
  );
  const facts = {
    blurClosed: false,
    clickOpened: false,
    escapeClosed: false,
    focusStayedAfterEscape: false,
    hoverOpened: false,
    keyboardOpened: false,
    targetFound: true,
  };
  await target.hover();
  await waitExpanded(target, true);
  facts.hoverOpened = true;
  await page.mouse.move(1, 899);
  await waitExpanded(target, false);
  await target.focus();
  await waitExpanded(target, true);
  facts.keyboardOpened = true;
  await target.press('Escape');
  await waitExpanded(target, false);
  facts.escapeClosed = true;
  facts.focusStayedAfterEscape = await target.evaluate(
    (element) => element === document.activeElement,
  );
  await target.click();
  await waitExpanded(target, true);
  facts.clickOpened = true;
  await target.evaluate((element) => element.blur());
  await waitExpanded(target, false);
  facts.blurClosed = true;
  return facts;
}

async function auditVisibleFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    if (!(await focused.isVisible().catch(() => false))) continue;
    const after = await focused.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        focusVisible: element.matches(':focus-visible'),
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    await focused.evaluate((element) => element.blur());
    const before = await focused.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    const outlineVisible =
      after.outlineStyle !== 'none' &&
      Number.parseFloat(after.outlineWidth) > 0 &&
      after.outlineColor !== 'transparent' &&
      !/rgba\([^)]*,\s*0\)$/u.test(after.outlineColor);
    const ringChanged =
      after.boxShadow !== 'none' && after.boxShadow !== before.boxShadow;
    return {
      after,
      before,
      outlineVisible,
      pass: after.focusVisible && (outlineVisible || ringChanged),
      ringChanged,
      target: await focused.evaluate((element) => ({
        role: element.getAttribute('role'),
        tag: element.localName,
      })),
    };
  }
  return {
    after: null,
    before: null,
    outlineVisible: false,
    pass: false,
    ringChanged: false,
    target: null,
  };
}

async function drawerOpenFacts(page, drawer) {
  return drawer.evaluate((drawerElement) => {
    const interactiveSelector =
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    const owners = [...document.querySelectorAll('[inert][aria-hidden="true"]')]
      .filter(
        (element) =>
          !element.contains(drawerElement) &&
          !drawerElement.contains(element) &&
          element.querySelector(interactiveSelector),
      );
    const owner = owners[0] ?? null;
    const scroll = [
      ...drawerElement.querySelectorAll(
        '.co-star-picker-drawer__scroll,.n-scrollbar-container',
      ),
    ].find((element) => {
      const style = getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getBoundingClientRect().height > 0
      );
    });
    const scrollStyle = scroll ? getComputedStyle(scroll) : null;
    return {
      activeInside: drawerElement.contains(document.activeElement),
      backgroundFocusableCount: owner
        ? owner.querySelectorAll(interactiveSelector).length
        : 0,
      backgroundOwner: owner
        ? {
            classes: [...owner.classList].sort(),
            tag: owner.tagName,
          }
        : null,
      scrollOwner: scroll
        ? {
            clientHeight: scroll.clientHeight,
            overflowY: scrollStyle.overflowY,
            overscrollBehaviorY: scrollStyle.overscrollBehaviorY,
            scrollHeight: scroll.scrollHeight,
          }
        : null,
    };
  });
}

async function assertDrawerTabIsolation(page, drawer) {
  const firstFocusable = await firstVisibleLocator(
    drawer.locator(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
    'Drawer focus target',
  );
  await firstFocusable.focus();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press(index === 6 ? 'Shift+Tab' : 'Tab');
    if (
      !(await drawer.evaluate(
        (element) => element.contains(document.activeElement),
      ))
    ) {
      return false;
    }
  }
  return true;
}

async function assertBackgroundCannotFocus(page, drawer) {
  return drawer.evaluate((drawerElement) => {
    const owner = [...document.querySelectorAll('[inert][aria-hidden="true"]')].find(
      (element) =>
        !element.contains(drawerElement) &&
        !drawerElement.contains(element),
    );
    const target = owner?.querySelector(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (!(target instanceof HTMLElement)) return false;
    target.focus();
    return document.activeElement !== target;
  });
}

async function assertDrawerScrollContainment(page, drawer, openFacts) {
  if (
    !openFacts.scrollOwner ||
    !['contain', 'none'].includes(openFacts.scrollOwner.overscrollBehaviorY)
  ) {
    return false;
  }
  if (
    openFacts.scrollOwner.scrollHeight <=
    openFacts.scrollOwner.clientHeight + 1
  ) {
    return true;
  }
  const scroll = await firstVisibleLocator(
    drawer.locator(
      '.co-star-picker-drawer__scroll,.n-scrollbar-container',
    ),
    'Drawer scroll owner',
  );
  const before = await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      outer: document.scrollingElement?.scrollTop ?? 0,
      rect: element.getBoundingClientRect().toJSON(),
    };
  });
  await page.mouse.move(
    before.rect.x + before.rect.width / 2,
    before.rect.y + Math.min(24, before.rect.height / 2),
  );
  await page.mouse.wheel(0, 480);
  await page.waitForTimeout(50);
  return scroll.evaluate(
    (element, outerBefore) =>
      (document.scrollingElement?.scrollTop ?? 0) === outerBefore,
    before.outer,
  );
}

async function closeDrawerAndCheckReturn(
  page,
  drawer,
  opener,
  method,
  maskSelector,
) {
  if (method === 'escape') {
    await page.keyboard.press('Escape');
  } else {
    const mask = await firstVisibleLocator(
      page.locator(maskSelector),
      'Drawer mask',
    );
    await mask.click({ position: { x: 8, y: 8 } });
  }
  await drawer.waitFor({ state: 'hidden' });
  await page.waitForTimeout(300);
  return opener.evaluate((element) => element === document.activeElement);
}

async function auditCompactDrawer(page, mobileEntry) {
  const result = {
    backgroundOwner: null,
    backgroundTabBlocked: false,
    escapeClosed: false,
    escapeFocusReturned: false,
    focusTrapped: false,
    maskClosed: false,
    maskFocusReturned: false,
    scrollContained: false,
  };
  await mobileEntry.click();
  const drawer = page.locator('#co-star-mobile-picker');
  await drawer.waitFor({ state: 'visible' });
  const openFacts = await drawerOpenFacts(page, drawer);
  result.backgroundOwner = openFacts.backgroundOwner;
  result.backgroundTabBlocked = await assertBackgroundCannotFocus(page, drawer);
  result.focusTrapped = await assertDrawerTabIsolation(page, drawer);
  result.scrollContained = await assertDrawerScrollContainment(
    page,
    drawer,
    openFacts,
  );
  result.escapeFocusReturned = await closeDrawerAndCheckReturn(
    page,
    drawer,
    mobileEntry,
    'escape',
    '.n-drawer-mask',
  );
  result.escapeClosed = !(await drawer.isVisible().catch(() => true));

  await mobileEntry.click();
  await drawer.waitFor({ state: 'visible' });
  result.maskFocusReturned = await closeDrawerAndCheckReturn(
    page,
    drawer,
    mobileEntry,
    'mask',
    '.n-drawer-mask',
  );
  result.maskClosed = !(await drawer.isVisible().catch(() => true));
  return result;
}

async function auditPersonDrawer(page) {
  const drawer = page.locator('#person-detail-panel[role="dialog"]');
  if (await drawer.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
  }
  const opener = await firstVisibleLocator(
    page.locator(
      '.ranked-person-row[aria-current="true"],.ranked-person-row.is-selected',
    ),
    'selected ranking person',
  );
  const result = {
    backgroundOwner: null,
    backgroundTabBlocked: false,
    escapeClosed: false,
    escapeFocusReturned: false,
    focusTrapped: false,
    maskClosed: false,
    maskFocusReturned: false,
    scrollContained: false,
  };
  await opener.focus();
  await opener.click();
  await drawer.waitFor({ state: 'visible' });
  const openFacts = await drawerOpenFacts(page, drawer);
  result.backgroundOwner = openFacts.backgroundOwner;
  result.backgroundTabBlocked = await assertBackgroundCannotFocus(page, drawer);
  result.focusTrapped = await assertDrawerTabIsolation(page, drawer);
  result.scrollContained = await assertDrawerScrollContainment(
    page,
    drawer,
    openFacts,
  );
  result.escapeFocusReturned = await closeDrawerAndCheckReturn(
    page,
    drawer,
    opener,
    'escape',
    '.person-detail-drawer__backdrop',
  );
  result.escapeClosed = !(await drawer.isVisible().catch(() => true));

  await opener.click();
  await drawer.waitFor({ state: 'visible' });
  result.maskFocusReturned = await closeDrawerAndCheckReturn(
    page,
    drawer,
    opener,
    'mask',
    '.person-detail-drawer__backdrop',
  );
  result.maskClosed = !(await drawer.isVisible().catch(() => true));
  return result;
}

export async function auditCandidatePage({ page, motion, route, width }) {
  const audit = await page.evaluate(
    ({ expectedMotion }) => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      };
      const interactive = [
        ...document.querySelectorAll(
          'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"]',
        ),
      ].filter(visible);
      const accessibleNameFailures = interactive
        .filter((element) => {
          const labels =
            'labels' in element && element.labels
              ? [...element.labels].map((label) => label.textContent).join(' ')
              : '';
          const name =
            [
              element.getAttribute('aria-label'),
              element.getAttribute('title'),
              labels,
              element.getAttribute('placeholder'),
              element.textContent,
            ]
              .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim())
              .find(Boolean) ?? '';
          return name.length === 0;
        })
        .map((element) => element.outerHTML.slice(0, 180));
      const ids = [...document.querySelectorAll('[id]')].map(
        (element) => element.id,
      );
      const duplicateIds = [
        ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
      ];
      const ownerSelectors = [
        '.app-page-scroll',
        '.query-editor__scroll',
        '.candidate-list',
        '.candidate-row-skeletons',
        '.person-detail-drawer__scroll',
        '.co-star-picker-drawer__scroll',
        '.n-scrollbar-container',
      ];
      const scrollOwners = ownerSelectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter(visible)
          .map((element) => {
            const style = getComputedStyle(element);
            return {
              clientHeight: element.clientHeight,
              clientWidth: element.clientWidth,
              horizontalOverflowPx: Math.max(
                0,
                element.scrollWidth - element.clientWidth,
              ),
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              overscrollBehaviorY: style.overscrollBehaviorY,
              scrollHeight: element.scrollHeight,
              scrollWidth: element.scrollWidth,
              selector,
            };
          }),
      );
      const isolatedSelectors = new Set([
        '.query-editor__scroll',
        '.candidate-list',
        '.candidate-row-skeletons',
        '.person-detail-drawer__scroll',
        '.co-star-picker-drawer__scroll',
      ]);
      const scrollViolations = scrollOwners
        .filter(
          (owner) =>
            owner.horizontalOverflowPx > 1 ||
            (isolatedSelectors.has(owner.selector) &&
              owner.scrollHeight > owner.clientHeight + 1 &&
              !['contain', 'none'].includes(owner.overscrollBehaviorY)),
        )
        .map((owner) => ({
          horizontalOverflowPx: owner.horizontalOverflowPx,
          overscrollBehaviorY: owner.overscrollBehaviorY,
          selector: owner.selector,
        }));
      const outer = document.scrollingElement;
      return {
        accessibleNameFailures,
        documentOverflowPx: Math.max(
          0,
          document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        duplicateIds,
        motionMatches:
          matchMedia('(prefers-reduced-motion: reduce)').matches ===
          (expectedMotion === 'reduced'),
        outerScrollOwner: outer
          ? {
              clientHeight: outer.clientHeight,
              scrollHeight: outer.scrollHeight,
              tag: outer.tagName,
            }
          : null,
        scrollOwners,
        scrollViolations,
      };
    },
    { expectedMotion: motion },
  );
  const actions = {
    drawer: 'not-applicable',
    focusVisible: await auditVisibleFocus(page),
    personDrawer: 'not-applicable',
    queryEscapeAndReturn: false,
    responsive: null,
    tooltip: null,
  };
  if (route === '/ranking' && width < 780) {
    actions.personDrawer = await auditPersonDrawer(page);
  }
  const summary = await firstVisibleLocator(
    page.locator('.query-summary'),
    'query summary',
  );
  await summary.focus();
  await summary.press('Enter');
  await page.locator('#query-editor').waitFor({ state: 'visible' });
  actions.tooltip = await auditTooltip(page);
  await page.keyboard.press('Escape');
  await page.locator('#query-editor').waitFor({ state: 'detached' });
  actions.queryEscapeAndReturn = await summary.evaluate(
    (element) => element === document.activeElement,
  );
  if (route === '/co-star') {
    const mobileEntry = page.locator('.co-star-mobile-entry').first();
    const rail = page.locator('.co-star-candidate-rail').first();
    actions.responsive = {
      mobileEntryVisible: await mobileEntry.isVisible().catch(() => false),
      railVisible: await rail.isVisible().catch(() => false),
    };
    if (width < 780 && actions.responsive.mobileEntryVisible) {
      actions.drawer = await auditCompactDrawer(page, mobileEntry);
    }
  }
  assertCandidateAuditEvidence({ actions, audit, route, width });
  return Object.freeze({ actions: Object.freeze(actions), audit });
}
