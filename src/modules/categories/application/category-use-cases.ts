import {
    EntityNotFoundError,
} from '../../../shared/domain/errors.js';
import { Category } from '../domain/category.js';
import { CategoryRepository } from '../domain/category-repository.js';

export interface CategoryDto {
    readonly id: number;
    readonly nome: string;
}

function toDto(category: Category): CategoryDto {
    return {
        id: category.id as number,
        nome: category.name,
    };
}

export class CreateCategory {
    constructor(private readonly categories: CategoryRepository) {}

    async execute(name: string): Promise<CategoryDto> {
        const category = await this.categories.add(Category.create(name));
        return toDto(category);
    }
}

export class ListCategories {
    constructor(private readonly categories: CategoryRepository) {}

    async execute(): Promise<CategoryDto[]> {
        const categories = await this.categories.findAll();
        return categories.map(toDto);
    }
}

export class RenameCategory {
    constructor(private readonly categories: CategoryRepository) {}

    async execute(id: number, name: string): Promise<void> {
        const category = await this.categories.findById(id);

        if (!category) {
            throw new EntityNotFoundError('Categoria não encontrada.');
        }

        category.rename(name);
        await this.categories.save(category);
    }
}

export class DeleteCategory {
    constructor(private readonly categories: CategoryRepository) {}

    async execute(id: number): Promise<void> {
        const deleted = await this.categories.deleteAndUnassignVideos(id);

        if (!deleted) {
            throw new EntityNotFoundError('Categoria não encontrada.');
        }
    }
}
