import fs from 'node:fs';

import { assertCanonicalJson, deepFreeze } from './canonical-json.mjs';

export class StrictJsonError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'StrictJsonError';
  }
}

const UTF8_DECODER = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

function byteOffset(source, characterOffset) {
  return Buffer.byteLength(source.slice(0, characterOffset), 'utf8');
}

export function decodeUtf8Strict(bytes, label = 'UTF-8 input') {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    throw new StrictJsonError(`${label}: UTF-8 BOM is not permitted`);
  }
  try {
    return UTF8_DECODER.decode(bytes);
  } catch (error) {
    throw new StrictJsonError(`${label}: invalid UTF-8`, { cause: error });
  }
}

export function parseJsonStrict(source, label = 'JSON') {
  if (typeof source !== 'string') throw new TypeError(`${label} must be text`);
  let offset = 0;

  function fail(message) {
    throw new StrictJsonError(
      `${label}: ${message} at byte ${byteOffset(source, offset)}`,
    );
  }

  function whitespace() {
    while (offset < source.length && /[\t\n\r ]/u.test(source[offset])) {
      offset += 1;
    }
  }

  function parseString() {
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const character = source[offset];
      if (character === '"') {
        offset += 1;
        try {
          return JSON.parse(source.slice(start, offset));
        } catch {
          fail('invalid string');
        }
      }
      if (character === '\\') {
        offset += 1;
        if (offset >= source.length) fail('unterminated escape');
        if (source[offset] === 'u') {
          const escape = source.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(escape)) fail('invalid Unicode escape');
          offset += 4;
        } else if (!/["\\/bfnrt]/u.test(source[offset])) {
          fail('invalid escape');
        }
      } else if (character.charCodeAt(0) < 0x20) {
        fail('unescaped control character');
      }
      offset += 1;
    }
    fail('unterminated string');
  }

  function parseNumber() {
    const match = source
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (!match) fail('invalid number');
    offset += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) fail('non-finite number');
    return result;
  }

  function parseArray() {
    const result = [];
    offset += 1;
    whitespace();
    if (source[offset] === ']') {
      offset += 1;
      return result;
    }
    while (true) {
      result.push(parseValue());
      whitespace();
      if (source[offset] === ']') {
        offset += 1;
        return result;
      }
      if (source[offset] !== ',') fail('expected comma or closing bracket');
      offset += 1;
      whitespace();
    }
  }

  function parseObject() {
    const result = Object.create(null);
    const keys = new Set();
    offset += 1;
    whitespace();
    if (source[offset] === '}') {
      offset += 1;
      return result;
    }
    while (true) {
      if (source[offset] !== '"') fail('expected object key');
      const key = parseString();
      if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace();
      if (source[offset] !== ':') fail('expected colon');
      offset += 1;
      result[key] = parseValue();
      whitespace();
      if (source[offset] === '}') {
        offset += 1;
        return result;
      }
      if (source[offset] !== ',') fail('expected comma or closing brace');
      offset += 1;
      whitespace();
    }
  }

  function parseLiteral(text, result) {
    if (!source.startsWith(text, offset)) fail(`expected ${text}`);
    offset += text.length;
    return result;
  }

  function parseValue() {
    whitespace();
    const character = source[offset];
    if (character === '"') return parseString();
    if (character === '{') return parseObject();
    if (character === '[') return parseArray();
    if (character === '-' || /[0-9]/u.test(character ?? '')) return parseNumber();
    if (character === 't') return parseLiteral('true', true);
    if (character === 'f') return parseLiteral('false', false);
    if (character === 'n') return parseLiteral('null', null);
    fail('expected value');
  }

  const parsed = parseValue();
  whitespace();
  if (offset !== source.length) fail('trailing content');
  return parsed;
}

export function parseCanonicalJson(source, label = 'JSON') {
  const parsed = parseJsonStrict(source, label);
  assertCanonicalJson(source, parsed, label);
  return deepFreeze(parsed);
}

export function readJsonStrict(filePath) {
  return parseJsonStrict(
    decodeUtf8Strict(fs.readFileSync(filePath), filePath),
    filePath,
  );
}

export function readCanonicalJson(filePath) {
  const source = decodeUtf8Strict(fs.readFileSync(filePath), filePath);
  return parseCanonicalJson(source, filePath);
}
