import fs from 'node:fs';

export class StrictJsonError extends Error {}

export function parseJsonStrict(source, label = 'JSON') {
  if (typeof source !== 'string') {
    throw new TypeError(`${label} must be text`);
  }
  let offset = 0;

  function fail(message) {
    throw new StrictJsonError(`${label}: ${message} at byte ${offset}`);
  }

  function whitespace() {
    while (offset < source.length && /[\t\n\r ]/.test(source[offset])) {
      offset += 1;
    }
  }

  function string() {
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const char = source[offset];
      if (char === '"') {
        offset += 1;
        try {
          return JSON.parse(source.slice(start, offset));
        } catch {
          fail('invalid string');
        }
      }
      if (char === '\\') {
        offset += 1;
        if (offset >= source.length) fail('unterminated escape');
        if (source[offset] === 'u') {
          const escape = source.slice(offset + 1, offset + 5);
          if (!/^[0-9A-Fa-f]{4}$/.test(escape)) fail('invalid unicode escape');
          offset += 4;
        } else if (!/["\\/bfnrt]/.test(source[offset])) {
          fail('invalid escape');
        }
      } else if (char.charCodeAt(0) < 0x20) {
        fail('unescaped control character');
      }
      offset += 1;
    }
    fail('unterminated string');
  }

  function number() {
    const match = source.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail('invalid number');
    offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail('non-finite number');
    return value;
  }

  function array() {
    const values = [];
    offset += 1;
    whitespace();
    if (source[offset] === ']') {
      offset += 1;
      return values;
    }
    while (true) {
      values.push(value());
      whitespace();
      if (source[offset] === ']') {
        offset += 1;
        return values;
      }
      if (source[offset] !== ',') fail('expected comma or closing bracket');
      offset += 1;
      whitespace();
    }
  }

  function object() {
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
      const key = string();
      if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace();
      if (source[offset] !== ':') fail('expected colon');
      offset += 1;
      result[key] = value();
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

  function literal(text, parsed) {
    if (!source.startsWith(text, offset)) fail(`expected ${text}`);
    offset += text.length;
    return parsed;
  }

  function value() {
    whitespace();
    const char = source[offset];
    if (char === '"') return string();
    if (char === '{') return object();
    if (char === '[') return array();
    if (char === '-' || /[0-9]/.test(char ?? '')) return number();
    if (char === 't') return literal('true', true);
    if (char === 'f') return literal('false', false);
    if (char === 'n') return literal('null', null);
    fail('expected value');
  }

  const parsed = value();
  whitespace();
  if (offset !== source.length) fail('trailing content');
  return parsed;
}

export function readJsonStrict(path) {
  return parseJsonStrict(fs.readFileSync(path, 'utf8'), path);
}
