import { ApiDecodeError, ApiTransportError } from './errors';

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ResponseDecoder<T> = (value: unknown) => T;

export interface ApiErrorResponseMetadata {
  readonly status: number;
  readonly header: (name: string) => string | null;
}

export interface ApiRequestOptions<T> {
  body?: BodyInit | null;
  decode: ResponseDecoder<T>;
  decodeError?: (
    value: unknown,
    status: number,
    metadata: ApiErrorResponseMetadata,
  ) => Error;
  headers?: HeadersInit;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  reference: string;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(options: ApiRequestOptions<T>): Promise<T>;
}

const LOCAL_ORIGIN = 'https://frontend.invalid';
const forbiddenCodePoint = /[\u0000-\u0020\u007f]/;

function invalidReference(): never {
  throw new ApiTransportError(
    'invalid-reference',
    'The API reference is not a safe relative path',
  );
}

function errorResponseMetadata(response: Response): ApiErrorResponseMetadata {
  const headers = new Map<string, string>();
  response.headers.forEach((value, name) => {
    headers.set(name.toLowerCase(), value);
  });
  return Object.freeze({
    status: response.status,
    header(name: string): string | null {
      try {
        const normalized = new Headers({ [name]: '' })
          .keys()
          .next().value;
        return normalized ? (headers.get(normalized) ?? null) : null;
      } catch {
        return null;
      }
    },
  });
}

export function assertSafeApiReference(reference: string): string {
  if (
    reference.length === 0 ||
    !reference.startsWith('/api/') ||
    reference.includes('#') ||
    reference.includes('\\') ||
    forbiddenCodePoint.test(reference)
  ) {
    return invalidReference();
  }

  const pathEnd = reference.search(/[?]/);
  const rawPath = pathEnd === -1 ? reference : reference.slice(0, pathEnd);
  if (
    rawPath.includes('%') ||
    rawPath.includes('//') ||
    rawPath.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return invalidReference();
  }

  let parsed: URL;
  try {
    parsed = new URL(reference, LOCAL_ORIGIN);
  } catch {
    return invalidReference();
  }
  if (
    parsed.origin !== LOCAL_ORIGIN ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    !parsed.pathname.startsWith('/api/')
  ) {
    return invalidReference();
  }

  return reference;
}

export function createApiClient(
  fetchImplementation: FetchImplementation,
): ApiClient {
  return {
    async request<T>(options: ApiRequestOptions<T>): Promise<T> {
      const reference = assertSafeApiReference(options.reference);
      let response: Response;

      try {
        response = await fetchImplementation(reference, {
          body: options.body,
          headers: options.headers,
          method: options.method ?? 'GET',
          signal: options.signal,
        });
      } catch (error) {
        throw new ApiTransportError(
          'network-failure',
          'The API request could not be completed',
          { cause: error },
        );
      }

      if (!response.ok && !options.decodeError) {
        throw new ApiTransportError(
          'http-status',
          `The API returned HTTP ${response.status}`,
          { status: response.status },
        );
      }

      let value: unknown;
      try {
        value = await response.json();
      } catch (error) {
        throw new ApiDecodeError(
          'invalid-json',
          'The API response is not valid JSON',
          { cause: error },
        );
      }

      if (!response.ok) {
        let decodedError: Error;
        try {
          decodedError = options.decodeError!(
            value,
            response.status,
            errorResponseMetadata(response),
          );
        } catch (error) {
          if (error instanceof ApiDecodeError) {
            throw error;
          }
          throw new ApiDecodeError(
            'schema-mismatch',
            'The API error response does not match its wire contract',
            { cause: error },
          );
        }
        if (!(decodedError instanceof Error)) {
          throw new ApiDecodeError(
            'schema-mismatch',
            'The API error decoder did not return an Error',
          );
        }
        throw decodedError;
      }

      try {
        return options.decode(value);
      } catch (error) {
        if (error instanceof ApiDecodeError) {
          throw error;
        }
        throw new ApiDecodeError(
          'schema-mismatch',
          'The API response does not match its wire contract',
          { cause: error },
        );
      }
    },
  };
}
