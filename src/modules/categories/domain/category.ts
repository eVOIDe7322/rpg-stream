import { DomainValidationError } from '../../../shared/domain/errors.js';

export class Category {
    private constructor(
        public readonly id: number | null,
        private categoryName: string,
    ) {}

    static create(name: string): Category {
        return new Category(null, Category.normalizeName(name));
    }

    static restore(id: number, name: string): Category {
        return new Category(id, Category.normalizeName(name));
    }

    get name(): string {
        return this.categoryName;
    }

    rename(name: string): void {
        this.categoryName = Category.normalizeName(name);
    }

    private static normalizeName(name: string): string {
        const normalizedName =
            typeof name === 'string' ? name.trim() : '';

        if (!normalizedName) {
            throw new DomainValidationError(
                'Nome da categoria é obrigatório.',
            );
        }

        return normalizedName;
    }
}
