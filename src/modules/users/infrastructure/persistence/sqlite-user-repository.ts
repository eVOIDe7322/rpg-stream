import { SqliteDatabase } from '../../../../shared/infrastructure/database/sqlite-database.js';
import { UserRepository } from '../../domain/user-repository.js';
import { StoredUser, UserRole } from '../../domain/user.js';

interface UserRow {
    readonly id: number;
    readonly nome: string;
    readonly senha_hash: string;
    readonly senha_salt: string;
    readonly papel: UserRole;
    readonly ativo: number;
    readonly criado_em: string;
}

function mapUser(row: UserRow): StoredUser {
    return {
        id: row.id,
        name: row.nome,
        passwordHash: row.senha_hash,
        passwordSalt: row.senha_salt,
        role: row.papel,
        active: row.ativo === 1,
        createdAt: row.criado_em,
    };
}

export class SqliteUserRepository implements UserRepository {
    constructor(private readonly database: SqliteDatabase) {}

    async count(): Promise<number> {
        const row = await this.database.get<{ readonly total: number }>(
            'SELECT COUNT(*) AS total FROM usuarios',
        );
        return row?.total ?? 0;
    }

    async findByName(name: string): Promise<StoredUser | null> {
        const row = await this.database.get<UserRow>(
            `SELECT * FROM usuarios WHERE nome = ? COLLATE NOCASE`,
            [name],
        );
        return row ? mapUser(row) : null;
    }

    async list(): Promise<readonly StoredUser[]> {
        const rows = await this.database.all<UserRow>(
            'SELECT * FROM usuarios ORDER BY nome COLLATE NOCASE',
        );
        return rows.map(mapUser);
    }

    async add(input: {
        name: string;
        passwordHash: string;
        passwordSalt: string;
        role: UserRole;
    }): Promise<number> {
        const result = await this.database.execute(
            `INSERT INTO usuarios
                (nome, senha_hash, senha_salt, papel, ativo, criado_em)
             VALUES (?, ?, ?, ?, 1, ?)`,
            [
                input.name,
                input.passwordHash,
                input.passwordSalt,
                input.role,
                new Date().toISOString(),
            ],
        );
        return result.lastID;
    }

    async update(
        id: number,
        changes: {
            role?: UserRole;
            active?: boolean;
            passwordHash?: string;
            passwordSalt?: string;
        },
    ): Promise<boolean> {
        const assignments: string[] = [];
        const parameters: Array<string | number | null> = [];

        if (changes.role !== undefined) {
            assignments.push('papel = ?');
            parameters.push(changes.role);
        }

        if (changes.active !== undefined) {
            assignments.push('ativo = ?');
            parameters.push(changes.active ? 1 : 0);
        }

        if (
            changes.passwordHash !== undefined &&
            changes.passwordSalt !== undefined
        ) {
            assignments.push('senha_hash = ?', 'senha_salt = ?');
            parameters.push(changes.passwordHash, changes.passwordSalt);
        }

        if (assignments.length === 0) {
            return false;
        }

        parameters.push(id);
        const result = await this.database.execute(
            `UPDATE usuarios SET ${assignments.join(', ')} WHERE id = ?`,
            parameters,
        );
        return result.changes > 0;
    }
}
