import type { Database } from '../../database/database.module';

/** The transaction handle passed to `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Anything a query can run on: the pool or an open transaction. */
export type DbExecutor = Database | Tx;
