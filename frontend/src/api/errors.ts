export type TransportErrorKind =
  | 'invalid-reference'
  | 'network-failure'
  | 'http-status';

export type DecodeErrorKind =
  | 'invalid-json'
  | 'invalid-utf8'
  | 'schema-mismatch';

export interface DecodeIssue {
  keyword: string;
  path: string;
}

export class ApiTransportError extends Error {
  readonly kind: TransportErrorKind;
  readonly status: number | undefined;

  constructor(
    kind: TransportErrorKind,
    message: string,
    options: {
      cause?: unknown;
      status?: number;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiTransportError';
    this.kind = kind;
    this.status = options.status;
  }
}

export class ApiDecodeError extends Error {
  readonly issues: readonly DecodeIssue[];
  readonly kind: DecodeErrorKind;

  constructor(
    kind: DecodeErrorKind,
    message: string,
    options: {
      cause?: unknown;
      issues?: readonly DecodeIssue[];
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiDecodeError';
    this.kind = kind;
    this.issues = Object.freeze([...(options.issues ?? [])].slice(0, 8));
  }
}
