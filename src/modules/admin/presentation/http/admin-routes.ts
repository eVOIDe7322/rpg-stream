import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../../../../shared/presentation/http/async-handler.js';
import { requireRoles } from '../../../../shared/presentation/http/access-control.js';
import { AdminController } from './admin-controller.js';

export function createAdminRouter(
    controller: AdminController,
    restoreUpload: RequestHandler,
): Router {
    const router = Router();
    router.use(requireRoles('admin'));
    router.get('/dashboard', asyncHandler(controller.getDashboard));
    router.get('/backup', asyncHandler(controller.backup));
    router.post(
        '/restore',
        restoreUpload,
        asyncHandler(controller.restore),
    );
    return router;
}
