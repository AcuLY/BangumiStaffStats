import type {
  CandidatesInputV1,
  CandidatesRequestV1,
  CandidatesViewV1,
  ErrorCodeV1,
  FieldErrorCodeV1,
  ResultErrorEnvelopeV1,
  SharedQueryV1Schema,
} from './generated/candidates/types.gen';
import type { ApiClient } from './client';
import { ApiDecodeError } from './errors';
import {
  type CandidatePayload,
  decodeCandidatePayload,
  decodeCandidatesError,
} from './adapters/candidates';

export class CandidatesApiError extends Error {
  readonly code: ErrorCodeV1;
  readonly fieldErrors: Readonly<
    Record<string, readonly FieldErrorCodeV1[]>
  >;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(envelope: ResultErrorEnvelopeV1, status: number) {
    super(candidateErrorMessage(envelope.error.code));
    this.name = 'CandidatesApiError';
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

export function decodeCandidatesApiError(
  value: unknown,
  status: number,
): CandidatesApiError {
  const envelope = decodeCandidatesError(value);
  if (!codesByStatus[status]?.includes(envelope.error.code)) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Candidates error status and code do not match the operation contract',
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
  return new CandidatesApiError(envelope, status);
}

export function candidateErrorMessage(code: ErrorCodeV1): string {
  if (code === 'NOT_READY' || code === 'SERVER_BUSY') {
    return '候选人物服务正在准备，请稍后重试';
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
    return '当前候选人物查询已不受支持，请重新设置条件';
  }
  return '候选人物暂时无法加载，请稍后重试';
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface CandidatesDriverRequest {
  readonly input: DeepReadonly<CandidatesInputV1>;
  readonly query: DeepReadonly<SharedQueryV1Schema>;
  readonly refreshCollection: boolean;
  readonly signal: AbortSignal;
  readonly transactionId: string;
  readonly view: DeepReadonly<CandidatesViewV1>;
}

export interface CandidatesDriverResponse {
  readonly payload: CandidatePayload;
  readonly requestId: string;
  readonly staleCollection: boolean;
  readonly transactionId: string;
  readonly warningCodes: readonly string[];
}

export interface CandidatesDriver {
  execute(request: CandidatesDriverRequest): Promise<CandidatesDriverResponse>;
}

function projectionMismatch(): never {
  throw new ApiDecodeError(
    'schema-mismatch',
    'Candidates response does not match its requested projection',
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

export function createCandidatesDriver(client: ApiClient): CandidatesDriver {
  return {
    async execute(request): Promise<CandidatesDriverResponse> {
      const refreshCollection =
        request.refreshCollection === true &&
        request.query.scope === 'personal';
      const body: CandidatesRequestV1 = {
        input: structuredClone(request.input),
        query: structuredClone(request.query) as SharedQueryV1Schema,
        view: structuredClone(request.view),
        ...(refreshCollection ? { refreshCollection: true } : {}),
      };
      const payload = await client.request({
        body: JSON.stringify(body),
        decode(value) {
          return decodeCandidatePayload(value, request.query.scope);
        },
        decodeError(value, status) {
          return decodeCandidatesApiError(value, status);
        },
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        reference: '/api/v1/candidates',
        signal: request.signal,
      });

      const expectedPage = request.view.page ?? 1;
      const expectedPageSize = request.view.pageSize ?? 10;
      const expectedPositionKeys = request.query.positionKeys.map(String);
      if (
        payload.scope !== request.query.scope ||
        payload.positionKey !== String(request.input.positionKey) ||
        payload.workUnit !==
          (request.query.mergeSeries === true ? 'series' : 'subject') ||
        payload.pagination.page !== expectedPage ||
        payload.pagination.pageSize !== expectedPageSize ||
        payload.positionCounts.length !== expectedPositionKeys.length ||
        payload.positionCounts.some(
          (entry, index) =>
            entry.positionKey !== expectedPositionKeys[index],
        )
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
