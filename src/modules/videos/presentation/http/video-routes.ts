import { RequestHandler, Router } from 'express';
import { asyncHandler } from '../../../../shared/presentation/http/async-handler.js';
import { requireRoles } from '../../../../shared/presentation/http/access-control.js';
import { VideoController } from './video-controller.js';

export function createVideoRouter(
    controller: VideoController,
    uploadSingleVideo: RequestHandler,
): Router {
    const router = Router();

    router.get('/', asyncHandler(controller.list));
    router.get('/trash', requireRoles('admin'), asyncHandler(controller.trash));
    router.post(
        '/upload',
        uploadSingleVideo,
        asyncHandler(controller.upload),
    );
    router.patch(
        '/:id/thumbnail',
        asyncHandler(controller.updateThumbnail),
    );
    router.post('/:id/pause', asyncHandler(controller.pause));
    router.post('/:id/resume', asyncHandler(controller.resume));
    router.post('/:id/cancel', asyncHandler(controller.cancel));
    router.get('/:id/history', asyncHandler(controller.history));
    router.get('/:id/markers', asyncHandler(controller.listMarkers));
    router.post('/:id/markers', asyncHandler(controller.addMarker));
    router.delete(
        '/:id/markers/:markerId',
        asyncHandler(controller.deleteMarker),
    );
    router.post(
        '/:id/restore',
        requireRoles('admin'),
        asyncHandler(controller.restore),
    );
    router.delete(
        '/:id/purge',
        requireRoles('admin'),
        asyncHandler(controller.purge),
    );
    router.get('/:id', asyncHandler(controller.details));
    router.patch('/:id', asyncHandler(controller.update));
    router.delete('/:id', asyncHandler(controller.delete));

    return router;
}
