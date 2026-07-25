import type { ApiClient } from './client';
import type { CatalogSnapshot } from './adapters/catalog';
import { decodeCatalogEnvelope } from './adapters/catalog';

export interface CatalogApi {
  load(signal?: AbortSignal): Promise<CatalogSnapshot>;
}

export function createCatalogApi(client: ApiClient): CatalogApi {
  return {
    load(signal?: AbortSignal): Promise<CatalogSnapshot> {
      return client.request({
        decode: decodeCatalogEnvelope,
        method: 'GET',
        reference: '/api/v1/catalog',
        signal,
      });
    },
  };
}
