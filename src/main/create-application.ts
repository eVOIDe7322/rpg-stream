import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import express, { Express } from 'express';
import multer from 'multer';
import {
    ApplicationConfig,
    loadApplicationConfig,
} from '../config/application-config.js';
import { AdminDashboard } from '../modules/admin/application/admin-dashboard.js';
import {
    applyPendingRestore,
    LibraryBackupService,
} from '../modules/admin/infrastructure/library-backup-service.js';
import { AdminController } from '../modules/admin/presentation/http/admin-controller.js';
import { createAdminRouter } from '../modules/admin/presentation/http/admin-routes.js';
import {
    CreateCategory,
    DeleteCategory,
    ListCategories,
    RenameCategory,
} from '../modules/categories/application/category-use-cases.js';
import { SqliteCategoryRepository } from '../modules/categories/infrastructure/persistence/sqlite-category-repository.js';
import { CategoryController } from '../modules/categories/presentation/http/category-controller.js';
import { createCategoryRouter } from '../modules/categories/presentation/http/category-routes.js';
import { UserService } from '../modules/users/application/user-service.js';
import { SqliteUserRepository } from '../modules/users/infrastructure/persistence/sqlite-user-repository.js';
import { UserController } from '../modules/users/presentation/http/user-controller.js';
import { createUserRouter } from '../modules/users/presentation/http/user-routes.js';
import { ProcessingEventBus } from '../modules/videos/application/processing-event-bus.js';
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
} from '../modules/videos/application/video-use-cases.js';
import { VideoProcessingQueue } from '../modules/videos/application/video-processing-queue.js';
import { backfillVideoData } from '../modules/videos/infrastructure/media/backfill-video-data.js';
import { FfmpegVideoTranscoder } from '../modules/videos/infrastructure/media/ffmpeg-video-transcoder.js';
import { SqliteProcessingHistoryRepository } from '../modules/videos/infrastructure/persistence/sqlite-processing-history-repository.js';
import { SqliteVideoJobRepository } from '../modules/videos/infrastructure/persistence/sqlite-video-job-repository.js';
import { SqliteVideoMarkerRepository } from '../modules/videos/infrastructure/persistence/sqlite-video-marker-repository.js';
import { SqliteVideoRepository } from '../modules/videos/infrastructure/persistence/sqlite-video-repository.js';
import { FilesystemVideoStorage } from '../modules/videos/infrastructure/storage/filesystem-video-storage.js';
import { ProcessingEventController } from '../modules/videos/presentation/http/processing-event-controller.js';
import { VideoController } from '../modules/videos/presentation/http/video-controller.js';
import { createVideoRouter } from '../modules/videos/presentation/http/video-routes.js';
import { DomainValidationError } from '../shared/domain/errors.js';
import { cleanupTemporaryFiles } from '../shared/infrastructure/filesystem/cleanup-temporary-files.js';
import { initializeSchema } from '../shared/infrastructure/database/initialize-schema.js';
import { SqliteDatabase } from '../shared/infrastructure/database/sqlite-database.js';
import {
    createAccessControl,
    protectMutations,
    requireRoles,
} from '../shared/presentation/http/access-control.js';
import { errorHandler } from '../shared/presentation/http/error-handler.js';

export interface Application {
    readonly app: Express;
    readonly config: ApplicationConfig;
    readonly database: SqliteDatabase;
    readonly shutdown: () => Promise<void>;
}

export async function createApplication(): Promise<Application> {
    const config = loadApplicationConfig();
    await mkdir(config.backupDirectory, { recursive: true });
    await applyPendingRestore(config);
    await Promise.all([
        mkdir(config.uploadsDirectory, { recursive: true }),
        mkdir(config.temporaryDirectory, { recursive: true }),
    ]);

    const database = new SqliteDatabase(config.databaseFile);
    await initializeSchema(database);

    const userRepository = new SqliteUserRepository(database);
    const userService = new UserService(userRepository);
    const authenticationEnabled = await userService.bootstrap(
        config.adminUsername,
        config.adminPassword,
    );

    const categoryRepository = new SqliteCategoryRepository(database);
    const categoryController = new CategoryController(
        new CreateCategory(categoryRepository),
        new ListCategories(categoryRepository),
        new RenameCategory(categoryRepository),
        new DeleteCategory(categoryRepository),
    );

    const videoRepository = new SqliteVideoRepository(database);
    const jobRepository = new SqliteVideoJobRepository(database);
    const historyRepository = new SqliteProcessingHistoryRepository(database);
    const markerRepository = new SqliteVideoMarkerRepository(database);
    const videoStorage = new FilesystemVideoStorage(config.uploadsDirectory);
    const videoTranscoder = new FfmpegVideoTranscoder();
    const eventBus = new ProcessingEventBus();
    const processingQueue = new VideoProcessingQueue(
        videoRepository,
        jobRepository,
        videoStorage,
        videoTranscoder,
        historyRepository,
        eventBus,
        config.queueConcurrency,
    );
    await processingQueue.initialize();

    const protectedTemporaryFiles = new Set(
        (await jobRepository.findProtectedTemporaryFiles()).map((file) =>
            path.resolve(file),
        ),
    );
    const cleanupResult = await cleanupTemporaryFiles(
        config.temporaryDirectory,
        24 * 60 * 60 * 1000,
        protectedTemporaryFiles,
    );

    if (cleanupResult.filesRemoved > 0) {
        console.log(
            `Limpeza temporária: ${cleanupResult.filesRemoved} arquivo(s) e ${cleanupResult.bytesRemoved} bytes removidos.`,
        );
    }

    const purgeVideo = new PurgeVideo(videoRepository, videoStorage);
    const purgedVideos = await purgeVideo.purgeExpired();

    if (purgedVideos > 0) {
        console.log(`${purgedVideos} vídeo(s) expirado(s) removido(s) da lixeira.`);
    }

    const markerUseCases = new ManageVideoMarkers(
        videoRepository,
        markerRepository,
    );
    const videoController = new VideoController(
        new ListVideos(videoRepository),
        new GetVideoDetails(videoRepository),
        new UpdateVideo(videoRepository),
        new UpdateVideoThumbnail(
            videoRepository,
            videoStorage,
            videoTranscoder,
        ),
        new DeleteVideo(
            videoRepository,
            videoStorage,
            jobRepository,
            processingQueue,
            config.trashRetentionDays,
        ),
        new UploadVideo(
            videoRepository,
            videoStorage,
            videoTranscoder,
            jobRepository,
            historyRepository,
            processingQueue,
        ),
        processingQueue,
        markerUseCases,
        new ListProcessingHistory(historyRepository),
        new ListTrash(videoRepository),
        new RestoreVideoFromTrash(videoRepository, videoStorage),
        purgeVideo,
    );

    void backfillVideoData(
        config.uploadsDirectory,
        videoTranscoder,
        videoRepository,
    ).catch((error) => {
        console.error('Falha ao atualizar vídeos antigos:', error);
    });

    const upload = multer({
        dest: config.temporaryDirectory,
        limits: { fileSize: config.maximumUploadSize, files: 1 },
        fileFilter: (_request, file, callback) => {
            if (file.mimetype.startsWith('video/')) {
                callback(null, true);
                return;
            }

            callback(
                new DomainValidationError(
                    'Selecione um arquivo de vídeo válido.',
                ),
            );
        },
    });
    const restoreUpload = multer({
        dest: config.temporaryDirectory,
        limits: { fileSize: config.maximumUploadSize * 2, files: 1 },
    });

    const backupService = new LibraryBackupService(
        database,
        config.databaseFile,
        config.uploadsDirectory,
        config.backupDirectory,
    );
    const adminController = new AdminController(
        new AdminDashboard(database, videoStorage),
        backupService,
    );
    const userController = new UserController(userService);
    const processingEvents = new ProcessingEventController(eventBus);

    const app = express();
    app.use(createAccessControl(userService, authenticationEnabled));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.static(config.publicDirectory));
    app.use('/auth', createUserRouter(userController));
    app.get('/events', processingEvents.connect);
    app.use(
        '/categorias',
        protectMutations('admin', 'editor'),
        createCategoryRouter(categoryController),
    );
    app.use(
        '/videos',
        protectMutations('admin', 'editor'),
        createVideoRouter(videoController, upload.single('video')),
    );
    app.use('/videos', express.static(config.uploadsDirectory));
    app.use(
        '/admin',
        requireRoles('admin'),
        createAdminRouter(
            adminController,
            restoreUpload.single('backup'),
        ),
    );
    app.use(errorHandler);

    return {
        app,
        config,
        database,
        shutdown: () => processingQueue.shutdown(),
    };
}
