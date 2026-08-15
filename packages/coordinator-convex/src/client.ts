import { ConvexHttpClient } from 'convex/browser';
import type { DefaultFunctionArgs, FunctionReference } from 'convex/server';

export interface ConvexCoordinatorClient {
  query(
    reference: FunctionReference<'query', 'public', DefaultFunctionArgs>,
    args: DefaultFunctionArgs,
  ): Promise<unknown>;
  mutation(
    reference: FunctionReference<'mutation', 'public', DefaultFunctionArgs>,
    args: DefaultFunctionArgs,
  ): Promise<unknown>;
}

class HttpConvexCoordinatorClient implements ConvexCoordinatorClient {
  readonly #client: ConvexHttpClient;

  public constructor(url: string) {
    this.#client = new ConvexHttpClient(url);
  }

  public query(
    reference: FunctionReference<'query', 'public', DefaultFunctionArgs>,
    args: DefaultFunctionArgs,
  ): Promise<unknown> {
    return this.#client.query(reference, args);
  }

  public mutation(
    reference: FunctionReference<'mutation', 'public', DefaultFunctionArgs>,
    args: DefaultFunctionArgs,
  ): Promise<unknown> {
    return this.#client.mutation(reference, args);
  }
}

export function createConvexCoordinatorClient(
  url: string,
): ConvexCoordinatorClient {
  return new HttpConvexCoordinatorClient(url);
}
