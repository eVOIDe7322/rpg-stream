import { SqliteDatabase } from '../../../../shared/infrastructure/database/sqlite-database.js';
import { CategoryRepository } from '../../domain/category-repository.js';
import { Category } from '../../domain/category.js';

interface CategoryRow {
    readonly id: number;
    readonly nome: string;
}

export class SqliteCategoryRepository implements CategoryRepository {
    constructor(private readonly database: SqliteDatabase) {}

    async add(category: Category): Promise<Category> {
        const result = await this.database.execute(
            'INSERT INTO categorias (nome) VALUES (?)',
            [category.name],
        );

        return Category.restore(result.lastID, category.name);
    }

    async findAll(): Promise<Category[]> {
        const rows = await this.database.all<CategoryRow>(
            'SELECT id, nome FROM categorias ORDER BY nome COLLATE NOCASE',
        );

        return rows.map((row) => Category.restore(row.id, row.nome));
    }

    async findById(id: number): Promise<Category | null> {
        const row = await this.database.get<CategoryRow>(
            'SELECT id, nome FROM categorias WHERE id = ?',
            [id],
        );

        return row ? Category.restore(row.id, row.nome) : null;
    }

    async save(category: Category): Promise<void> {
        await this.database.execute(
            'UPDATE categorias SET nome = ? WHERE id = ?',
            [category.name, category.id],
        );
    }

    async deleteAndUnassignVideos(id: number): Promise<boolean> {
        return this.database.transaction(async () => {
            await this.database.execute(
                'UPDATE videos SET categoria_id = NULL WHERE categoria_id = ?',
                [id],
            );

            const result = await this.database.execute(
                'DELETE FROM categorias WHERE id = ?',
                [id],
            );

            return result.changes > 0;
        });
    }
}
