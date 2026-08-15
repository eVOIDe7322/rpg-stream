import { Request, Response } from 'express';
import {
    DeleteVideo,
    GetVideoDetails,
    ListProcessingHistory,
    ListTrash,
    ListVideos,
    ManageVideoMarkers,
    PurgeVideo,
    RestoreVideoFromTrash,
    UpdateVideo,
    UpdateVideoThumbnail,
    UploadVideo,
} from '../../application/video-use-cases.js';
import { DomainValidationError } from '../../../../shared/domain/errors.js';
import { VideoProcessingQueue } from '../../application/video-processing-queue.js';

function parseOptionalCategoryId(value: unknown): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const categoryId = Number(value);

    if (!Number.isInteger(categoryId) || categoryId < 1) {
        throw new DomainValidationError('Categoria inválida.');
    }

    return categoryId;
}

function hasProperty(
    value: object,
    property: string,
): boolean {
    return Object.prototype.hasOwnProperty.call(value, property);
}

export class VideoController {
    constructor(
        private readonly listVideos: ListVideos,
        private readonly getVideoDetails: GetVideoDetails,
        private readonly updateVideo: UpdateVideo,
        private readonly updateVideoThumbnail: UpdateVideoThumbnail,
        private readonly deleteVideo: DeleteVideo,
        private readonly uploadVideo: UploadVideo,
        private readonly queue: VideoProcessingQueue,
        private readonly markers: ManageVideoMarkers,
        private readonly processingHistory: ListProcessingHistory,
        private readonly listTrash: ListTrash,
        private readonly restoreVideo: RestoreVideoFromTrash,
        private readonly purgeVideo: PurgeVideo,
    ) {}

    list = async (request: Request, response: Response): Promise<void> => {
        const categoryId = parseOptionalCategoryId(request.query.cat);
        response.json(await this.listVideos.execute(categoryId));
    };

    details = async (request: Request, response: Response): Promise<void> => {
        response.json(await this.getVideoDetails.execute(request.params.id));
    };

    update = async (request: Request, response: Response): Promise<void> => {
        const body =
            request.body &&
            typeof request.body === 'object' &&
            !Array.isArray(request.body)
                ? request.body
                : {};
        const changes: {
            title?: string;
            categoryId?: number | null;
        } = {};

        if (hasProperty(body, 'titulo')) {
            changes.title = body.titulo;
        }

        if (hasProperty(body, 'categoria_id')) {
            changes.categoryId =
                body.categoria_id === null
                    ? null
                    : parseOptionalCategoryId(body.categoria_id);
        }

        await this.updateVideo.execute(request.params.id, changes);
        response.json({ message: 'Vídeo atualizado com sucesso.' });
    };

    updateThumbnail = async (
        request: Request,
        response: Response,
    ): Promise<void> => {
        await this.updateVideoThumbnail.execute(
            request.params.id,
            Number(request.body?.segundo),
        );
        response.json({ message: 'Capa atualizada com sucesso.' });
    };

    delete = async (request: Request, response: Response): Promise<void> => {
        const result = await this.deleteVideo.execute(request.params.id);
        response.json({
            message: result.filesRemoved
                ? 'Vídeo movido para a lixeira.'
                : 'Vídeo movido para a lixeira; a pasta já não existia.',
        });
    };

    pause = async (request: Request, response: Response): Promise<void> => {
        await this.queue.pause(request.params.id);
        response.json({ message: 'Conversão pausada.' });
    };

    resume = async (request: Request, response: Response): Promise<void> => {
        await this.queue.resume(request.params.id);
        response.json({ message: 'Conversão adicionada à fila.' });
    };

    cancel = async (request: Request, response: Response): Promise<void> => {
        await this.queue.cancel(request.params.id);
        response.json({ message: 'Conversão cancelada.' });
    };

    history = async (request: Request, response: Response): Promise<void> => {
        response.json(
            await this.processingHistory.execute(request.params.id),
        );
    };

    listMarkers = async (
        request: Request,
        response: Response,
    ): Promise<void> => {
        response.json(await this.markers.list(request.params.id));
    };

    addMarker = async (
        request: Request,
        response: Response,
    ): Promise<void> => {
        response.status(201).json(
            await this.markers.add(
                request.params.id,
                request.body?.titulo,
                Number(request.body?.tempo_segundos),
                request.user?.id ?? null,
            ),
        );
    };

    deleteMarker = async (
        request: Request,
        response: Response,
    ): Promise<void> => {
        await this.markers.delete(
            request.params.id,
            Number(request.params.markerId),
        );
        response.status(204).end();
    };

    trash = async (_request: Request, response: Response): Promise<void> => {
        response.json(await this.listTrash.execute());
    };

    restore = async (request: Request, response: Response): Promise<void> => {
        await this.restoreVideo.execute(request.params.id);
        response.json({ message: 'Vídeo restaurado.' });
    };

    purge = async (request: Request, response: Response): Promise<void> => {
        await this.purgeVideo.execute(request.params.id);
        response.json({ message: 'Vídeo excluído definitivamente.' });
    };

    upload = async (request: Request, response: Response): Promise<void> => {
        if (!request.file) {
            throw new DomainValidationError('Nenhum arquivo enviado.');
        }

        const result = await this.uploadVideo.execute({
            temporaryFile: request.file.path,
            title: request.body.titulo,
            categoryId: request.body.categoria_id,
        });

        response.status(202).json({
            message: 'Processamento iniciado.',
            videoId: result.videoId,
        });
    };
}
