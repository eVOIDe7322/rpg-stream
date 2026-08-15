import { Router } from 'express';
import { asyncHandler } from '../../../../shared/presentation/http/async-handler.js';
import { requireRoles } from '../../../../shared/presentation/http/access-control.js';
import { UserController } from './user-controller.js';

export function createUserRouter(controller: UserController): Router {
    const router = Router();
    router.get('/me', controller.me);
    router.get('/users', requireRoles('admin'), asyncHandler(controller.list));
    router.post('/users', requireRoles('admin'), asyncHandler(controller.create));
    router.patch(
        '/users/:id',
        requireRoles('admin'),
        asyncHandler(controller.update),
    );
    return router;
}
