import type {
  ErrorCodeV1,
  FieldErrorCodeV1,
  RankingsRequestV1,
  RankingsViewV1,
  ResultErrorEnvelopeV1,
  SharedQueryV1Schema,
} from './generated/rankings/types.gen';
import type { ApiClient } from './client';
import { ApiDecodeError } from './errors';
import {
  type RankingPayload,
  decodeRankingPayload,
  decodeRankingsError,
} from './adapters/rankings';

export class RankingsApiError extends Error {
  readonly code: ErrorCodeV1;
  readonly fieldErrors: Readonly<
    Record<string, readonly FieldErrorCodeV1[]>
  >;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(envelope: ResultErrorEnvelopeV1, status: number) {
    super(rankingErrorMessage(envelope.error.code));
    this.name = 'RankingsApiError';
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

export function decodeRankingsApiError(
  value: unknown,
  status: number,
): RankingsApiError {
  const envelope = decodeRankingsError(value);
  if (!codesByStatus[status]?.includes(envelope.error.code)) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Rankings error status and code do not match the operation contract',
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
  return new RankingsApiError(envelope, status);
}

export function rankingErrorMessage(code: ErrorCodeV1): string {
  if (code === 'NOT_READY' || code === 'SERVER_BUSY') {
    return '排行服务正在准备，请稍后重试';
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
    code === 'INVALID_JSON' ||
    code === 'INVALID_REQUEST' ||
    code === 'FIELD_INVALID' ||
    code === 'POSITION_SELECTION_CONFLICT' ||
    code === 'POSITION_NOT_FOUND' ||
    code === 'POSITION_NOT_SELECTABLE' ||
    code === 'POSITION_SUBJECT_TYPE_MISMATCH' ||
    code === 'CAPABILITY_NOT_AVAILABLE'
  ) {
    return '当前排行查询已不受支持，请重新设置条件';
  }
  return '人物排行暂时无法完成，请稍后重试';
}

export interface RankingsDriverRequest {
  readonly query: DeepReadonly<SharedQueryV1Schema>;
  readonly refreshCollection: boolean;
  readonly signal: AbortSignal;
  readonly transactionId: string;
  readonly view: Readonly<RankingsViewV1>;
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface RankingsDriverResponse {
  readonly payload: RankingPayload;
  readonly requestId: string;
  readonly staleCollection: boolean;
  readonly transactionId: string;
  readonly warningCodes: readonly string[];
}

export interface RankingsDriver {
  execute(request: RankingsDriverRequest): Promise<RankingsDriverResponse>;
}

export function createRankingsDriver(client: ApiClient): RankingsDriver {
  return {
    async execute(request): Promise<RankingsDriverResponse> {
      const body: RankingsRequestV1 = {
        query: structuredClone(request.query) as SharedQueryV1Schema,
        refreshCollection: request.refreshCollection,
        view: structuredClone(request.view),
      };
      const payload = await client.request({
        body: JSON.stringify(body),
        decode: decodeRankingPayload,
        decodeError(value, status) {
          return decodeRankingsApiError(value, status);
        },
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        reference: '/api/v1/rankings',
        signal: request.signal,
      });
      const expectedMetric = request.view.sort ?? 'count';
      const expectedPage = request.view.page ?? 1;
      const expectedPageSize = request.view.pageSize ?? 10;
      if (
        payload.scope !== request.query.scope ||
        payload.metricScale.metric !== expectedMetric ||
        payload.pagination.page !== expectedPage ||
        payload.pagination.pageSize !== expectedPageSize
      ) {
        throw new ApiDecodeError(
          'schema-mismatch',
          'Rankings response does not match its requested projection',
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
