import type {
  ErrorCodeV1,
  FieldErrorCodeV1,
  PersonDetailErrorEnvelopeV1,
  PersonDetailInputV1,
  PersonDetailRequestV1,
  PersonDetailViewV1,
  SharedQueryV1Schema,
} from './generated/person-detail/types.gen';
import type { ApiClient } from './client';
import { ApiDecodeError } from './errors';
import {
  decodePersonDetailError,
  decodePersonDetailPayload,
  type PersonDetailPayload,
} from './adapters/personDetail';

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export class PersonDetailApiError extends Error {
  readonly code: ErrorCodeV1;
  readonly fieldErrors: Readonly<
    Record<string, readonly FieldErrorCodeV1[]>
  >;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(envelope: PersonDetailErrorEnvelopeV1, status: number) {
    super(personDetailErrorMessage(envelope.error.code));
    this.name = 'PersonDetailApiError';
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
    'PERSON_NOT_IN_QUERY_RESULT',
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

export function personDetailErrorMessage(code: ErrorCodeV1): string {
  if (code === 'PERSON_NOT_IN_QUERY_RESULT') {
    return '该人物已不在当前查询结果中，请重新选择';
  }
  if (code === 'NOT_READY' || code === 'SERVER_BUSY') {
    return '人物详情服务正在准备，请稍后重试';
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
  if (code === 'ENTITY_NOT_FOUND') {
    return '没有找到该人物';
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
    return '当前人物详情查询已不受支持，请重新设置条件';
  }
  return '人物详情暂时无法完成，请稍后重试';
}

export function decodePersonDetailApiError(
  value: unknown,
  status: number,
): PersonDetailApiError {
  const envelope = decodePersonDetailError(value);
  if (!codesByStatus[status]?.includes(envelope.error.code)) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Person-detail error status and code do not match the operation contract',
      {
        issues: [{ keyword: 'status-code', path: '/error/code' }],
      },
    );
  }
  return new PersonDetailApiError(envelope, status);
}

export interface PersonDetailDriverRequest {
  readonly input: Readonly<PersonDetailInputV1>;
  readonly query: DeepReadonly<SharedQueryV1Schema>;
  readonly signal: AbortSignal;
  readonly transactionId: string;
  readonly view: Readonly<PersonDetailViewV1>;
}

export interface PersonDetailDriverResponse {
  readonly payload: PersonDetailPayload;
  readonly requestId: string;
  readonly staleCollection: boolean;
  readonly transactionId: string;
  readonly warningCodes: readonly string[];
}

export interface PersonDetailDriver {
  execute(
    request: PersonDetailDriverRequest,
  ): Promise<PersonDetailDriverResponse>;
}

export function createPersonDetailDriver(
  client: ApiClient,
): PersonDetailDriver {
  return {
    async execute(request): Promise<PersonDetailDriverResponse> {
      const body: PersonDetailRequestV1 = {
        input: structuredClone(request.input),
        query: structuredClone(request.query) as SharedQueryV1Schema,
        view: structuredClone(request.view),
      };
      const payload = await client.request({
        body: JSON.stringify(body),
        decode: decodePersonDetailPayload,
        decodeError(value, status) {
          return decodePersonDetailApiError(value, status);
        },
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        reference: '/api/v1/person-detail',
        signal: request.signal,
      });
      const expectedSection = request.view.section ?? 'works';
      const expectedPage = request.view.page ?? 1;
      const expectedPageSize = request.view.pageSize ?? 10;
      const expectedWorkUnit =
        request.query.mergeSeries === true ? 'series' : 'subject';
      if (
        payload.scope !== request.query.scope ||
        payload.person.id !== request.input.personId ||
        payload.section !== expectedSection ||
        payload.summary.workUnit !== expectedWorkUnit ||
        payload.pagination.page !== expectedPage ||
        payload.pagination.pageSize !== expectedPageSize
      ) {
        throw new ApiDecodeError(
          'schema-mismatch',
          'Person-detail response does not match its requested projection',
          {
            issues: [{ keyword: 'request-response', path: '/data' }],
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
