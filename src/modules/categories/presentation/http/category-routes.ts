import { Router } from 'express';
import { asyncHandler } from '../../../../shared/presentation/http/async-handler.js';
import { CategoryController } from './category-controller.js';

export function createCategoryRouter(controller: CategoryController): Router {
    const router = Router();

    router.post('/', asyncHandler(controller.create));
    router.get('/', asyncHandler(controller.list));
    router.patch('/:id', asyncHandler(controller.rename));
    router.delete('/:id', asyncHandler(controller.delete));

    return router;
}
