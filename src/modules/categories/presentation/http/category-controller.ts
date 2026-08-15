import { Request, Response } from 'express';
import {
    CreateCategory,
    DeleteCategory,
    ListCategories,
    RenameCategory,
} from '../../application/category-use-cases.js';
import { DomainValidationError } from '../../../../shared/domain/errors.js';

function parseCategoryId(value: string): number {
    const id = Number(value);

    if (!Number.isInteger(id) || id < 1) {
        throw new DomainValidationError('ID de categoria inválido.');
    }

    return id;
}

export class CategoryController {
    constructor(
        private readonly createCategory: CreateCategory,
        private readonly listCategories: ListCategories,
        private readonly renameCategory: RenameCategory,
        private readonly deleteCategory: DeleteCategory,
    ) {}

    create = async (request: Request, response: Response): Promise<void> => {
        const category = await this.createCategory.execute(
            request.body?.nome,
        );
        response.status(201).json(category);
    };

    list = async (_request: Request, response: Response): Promise<void> => {
        response.json(await this.listCategories.execute());
    };

    rename = async (request: Request, response: Response): Promise<void> => {
        await this.renameCategory.execute(
            parseCategoryId(request.params.id),
            request.body?.nome,
        );
        response.json({ message: 'Categoria renomeada com sucesso.' });
    };

    delete = async (request: Request, response: Response): Promise<void> => {
        await this.deleteCategory.execute(
            parseCategoryId(request.params.id),
        );
        response.json({
            message:
                "Categoria removida. Os vídeos vinculados agora estão em 'Sem Categoria'.",
        });
    };
}
