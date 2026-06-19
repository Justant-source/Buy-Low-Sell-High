declare module "pg" {
  export interface QueryResult<TRow = Record<string, unknown>> {
    rows: TRow[];
  }

  export interface PoolConfig {
    connectionString?: string;
  }

  export interface PoolClient {
    query<TRow = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<TRow = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
    connect(): Promise<PoolClient>;
  }
}
