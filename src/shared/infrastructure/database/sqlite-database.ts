import sqlite3 from 'sqlite3';

export type SqlParameter = string | number | null;

export interface SqlExecutionResult {
    readonly lastID: number;
    readonly changes: number;
}

export class SqliteDatabase {
    private readonly connection: sqlite3.Database;

    constructor(filename: string) {
        this.connection = new sqlite3.Database(filename);
    }

    execute(
        sql: string,
        parameters: readonly SqlParameter[] = [],
    ): Promise<SqlExecutionResult> {
        return new Promise((resolve, reject) => {
            this.connection.run(sql, [...parameters], function (error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get<T>(
        sql: string,
        parameters: readonly SqlParameter[] = [],
    ): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            this.connection.get(
                sql,
                [...parameters],
                (error, row: T | undefined) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(row);
                },
            );
        });
    }

    all<T>(
        sql: string,
        parameters: readonly SqlParameter[] = [],
    ): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.connection.all(
                sql,
                [...parameters],
                (error, rows: T[]) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(rows);
                },
            );
        });
    }

    async transaction<T>(work: () => Promise<T>): Promise<T> {
        await this.execute('BEGIN IMMEDIATE TRANSACTION');

        try {
            const result = await work();
            await this.execute('COMMIT');
            return result;
        } catch (error) {
            await this.execute('ROLLBACK');
            throw error;
        }
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connection.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}
