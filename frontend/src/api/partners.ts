import type {
  ErrorCodeV1,
  FieldErrorCodeV1,
  PartnersInputV1,
  PartnersRequestV1,
  PartnersResultErrorEnvelopeV1,
  PartnersViewV1,
  SharedQueryV1Schema,
} from './generated/partners/types.gen';
import type {
  ApiClient,
  ApiErrorResponseMetadata,
} from './client';
import { ApiDecodeError } from './errors';
import {
  decodePartnersError,
  decodePartnersPayload,
  type PartnersPayload,
} from './adapters/partners';

export class PartnersApiError extends Error {
  readonly code: ErrorCodeV1;
  readonly fieldErrors: Readonly<
    Record<string, readonly FieldErrorCodeV1[]>
  >;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(
    envelope: PartnersResultErrorEnvelopeV1,
    status: number,
    retryAfterSeconds: number | null = null,
  ) {
    super(partnersErrorMessage(envelope.error.code));
    this.name = 'PartnersApiError';
    this.code = envelope.error.code;
    this.fieldErrors = Object.freeze(
      Object.fromEntries(
        Object.entries(envelope.error.fieldErrors).map(([path, codes]) => [
          path,
          Object.freeze([...codes]),
        ]),
      ),
    );
    this.requestId = envelope.meta.requestId;
    this.retryable = envelope.error.retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

const codesByStatus: Readonly<
  Partial<Record<number, readonly ErrorCodeV1[]>>
> = Object.freeze({
  400: Object.freeze<ErrorCodeV1[]>([
    'INVALID_JSON',
    'INVALID_REQUEST',
    'FIELD_INVALID',
    'POSITION_SELECTION_CONFLICT',
    'POSITION_NOT_FOUND',
    'POSITION_NOT_SELECTABLE',
    'POSITION_SUBJECT_TYPE_MISMATCH',
    'CAPABILITY_NOT_AVAILABLE',
    'PERSON_NOT_IN_QUERY_RESULT',
    'PARTICIPANT_LIMIT_EXCEEDED',
    'IDENTITY_LIMIT_EXCEEDED',
  ]),
  403: Object.freeze<ErrorCodeV1[]>(['COLLECTION_NOT_PUBLIC']),
  404: Object.freeze<ErrorCodeV1[]>(['USER_NOT_FOUND', 'ENTITY_NOT_FOUND']),
  405: Object.freeze<ErrorCodeV1[]>(['INVALID_REQUEST']),
  413: Object.freeze<ErrorCodeV1[]>(['REQUEST_TOO_LARGE']),
  415: Object.freeze<ErrorCodeV1[]>(['UNSUPPORTED_MEDIA_TYPE']),
  429: Object.freeze<ErrorCodeV1[]>(['RATE_LIMITED']),
  500: Object.freeze<ErrorCodeV1[]>(['INTERNAL_ERROR']),
  502: Object.freeze<ErrorCodeV1[]>(['UPSTREAM_PROTOCOL_ERROR']),
  503: Object.freeze<ErrorCodeV1[]>([
    'SERVER_BUSY',
    'NOT_READY',
    'UPSTREAM_UNAVAILABLE',
  ]),
  504: Object.freeze<ErrorCodeV1[]>(['UPSTREAM_TIMEOUT']),
});

export function decodePartnersApiError(
  value: unknown,
  status: number,
  retryAfterHeader?: string | null,
): PartnersApiError {
  const envelope = decodePartnersError(value);
  if (!codesByStatus[status]?.includes(envelope.error.code)) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Partners error status and code do not match the operation contract',
      {
        issues: [
          {
            keyword: 'status-code',
            path: '/error/code',
          },
        ],
      },
    );
  }
  return new PartnersApiError(
    envelope,
    status,
    decodeRetryAfterSeconds(retryAfterHeader),
  );
}

export function decodeRetryAfterSeconds(
  value: string | null | undefined,
): number | null {
  if (!value || !/^(?:[1-9]|[1-5][0-9]|60)$/.test(value)) {
    return null;
  }
  return Number(value);
}

export function partnersErrorMessage(code: ErrorCodeV1): string {
  if (code === 'NOT_READY' || code === 'SERVER_BUSY') {
    return '合作人物服务正在准备，请稍后重试';
  }
  if (
    code === 'UPSTREAM_TIMEOUT' ||
    code === 'UPSTREAM_UNAVAILABLE' ||
    code === 'UPSTREAM_PROTOCOL_ERROR'
  ) {
    return '收藏数据暂时不可用，请稍后重试';
  }
  if (code === 'RATE_LIMITED') {
    return '查询过于频繁，请稍后再试';
  }
  if (code === 'COLLECTION_NOT_PUBLIC' || code === 'USER_NOT_FOUND') {
    return '无法读取该用户的公开收藏';
  }
  if (
    code === 'PERSON_NOT_IN_QUERY_RESULT' ||
    code === 'ENTITY_NOT_FOUND'
  ) {
    return '所选人物已不在当前查询结果中，请重新选择';
  }
  if (
    code === 'PARTICIPANT_LIMIT_EXCEEDED' ||
    code === 'IDENTITY_LIMIT_EXCEEDED'
  ) {
    return '所选人物或身份数量超过限制，请调整后重试';
  }
  if (
    code === 'INVALID_JSON' ||
    code === 'INVALID_REQUEST' ||
    code === 'FIELD_INVALID' ||
    code === 'POSITION_SELECTION_CONFLICT' ||
    code === 'POSITION_NOT_FOUND' ||
    code === 'POSITION_NOT_SELECTABLE' ||
    code === 'POSITION_SUBJECT_TYPE_MISMATCH' ||
    code === 'CAPABILITY_NOT_AVAILABLE'
  ) {
    return '当前合作人物查询已不受支持，请重新设置条件';
  }
  return '合作人物暂时无法加载，请稍后重试';
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface PartnersDriverRequest {
  readonly input: DeepReadonly<PartnersInputV1>;
  readonly query: DeepReadonly<SharedQueryV1Schema>;
  readonly refreshCollection: false;
  readonly signal: AbortSignal;
  readonly transactionId: string;
  readonly view: DeepReadonly<PartnersViewV1>;
}

export interface PartnersDriverResponse {
  readonly payload: PartnersPayload;
  readonly requestId: string;
  readonly staleCollection: boolean;
  readonly transactionId: string;
  readonly warningCodes: readonly string[];
}

export interface PartnersDriver {
  execute(request: PartnersDriverRequest): Promise<PartnersDriverResponse>;
}

export interface PartnersRetryRuntime {
  readonly random?: () => number;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

function projectionMismatch(): never {
  throw new ApiDecodeError(
    'schema-mismatch',
    'Partners response does not match its requested projection',
    {
      issues: [
        {
          keyword: 'request-response',
          path: '/data',
        },
      ],
    },
  );
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function waitForRetry(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
      signal.removeEventListener('abort', abort);
      reject(abortError());
    };
    timeoutId = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function boundedJitterMilliseconds(
  seconds: number,
  random: () => number,
): number {
  const base = seconds * 1_000;
  const sampled = random();
  const fraction = Number.isFinite(sampled)
    ? Math.min(0.999_999, Math.max(0, sampled))
    : 0;
  const jitter = Math.floor(Math.min(1_000, base / 10) * fraction);
  return Math.min(60_000, base + jitter);
}

function retryablePartnersError(
  error: unknown,
): error is PartnersApiError & { retryAfterSeconds: number } {
  return (
    error instanceof PartnersApiError &&
    error.retryable &&
    error.retryAfterSeconds !== null &&
    (error.status === 429 || error.code === 'SERVER_BUSY')
  );
}

export function createPartnersDriver(
  client: ApiClient,
  runtime: PartnersRetryRuntime = {},
): PartnersDriver {
  const random = runtime.random ?? Math.random;
  const wait = runtime.wait ?? waitForRetry;
  return {
    async execute(request): Promise<PartnersDriverResponse> {
      const body: PartnersRequestV1 = {
        input: structuredClone(request.input) as PartnersInputV1,
        query: structuredClone(request.query) as SharedQueryV1Schema,
        view: structuredClone(request.view),
      };
      const requestBody = JSON.stringify(body);
      const requestOnce = () =>
        client.request({
          body: requestBody,
          decode(value) {
            return decodePartnersPayload(value, request.query.scope);
          },
          decodeError(
            value,
            status,
            metadata: ApiErrorResponseMetadata,
          ) {
            return decodePartnersApiError(
              value,
              status,
              metadata.header('retry-after'),
            );
          },
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
          reference: '/api/v1/partners',
          signal: request.signal,
        });
      let payload: PartnersPayload;
      try {
        payload = await requestOnce();
      } catch (error) {
        if (!retryablePartnersError(error)) {
          throw error;
        }
        await wait(
          boundedJitterMilliseconds(
            error.retryAfterSeconds,
            random,
          ),
          request.signal,
        );
        if (request.signal.aborted) {
          throw abortError();
        }
        payload = await requestOnce();
      }

      const expectedPage = request.view.page ?? 1;
      const expectedPageSize = request.view.pageSize ?? 10;
      const expectedSourceKeys = request.input.source.positionKeys.map(String);
      if (
        payload.scope !== request.query.scope ||
        payload.source.person.id !== request.input.source.personId ||
        payload.source.positionKeys.length !== expectedSourceKeys.length ||
        payload.source.positionKeys.some(
          (positionKey, index) =>
            positionKey !== expectedSourceKeys[index],
        ) ||
        payload.workUnit !==
          (request.query.mergeSeries === true ? 'series' : 'subject') ||
        payload.pagination.page !== expectedPage ||
        payload.pagination.pageSize !== expectedPageSize
      ) {
        return projectionMismatch();
      }

      const warningCodes = payload.collection?.warningCodes ?? [];
      return {
        payload,
        requestId: payload.requestId,
        staleCollection: payload.collection?.stale === true,
        transactionId: request.transactionId,
        warningCodes,
      };
    },
  };
}
