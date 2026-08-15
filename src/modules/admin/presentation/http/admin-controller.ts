import { Request, Response } from 'express';
import { AdminDashboard } from '../../application/admin-dashboard.js';
import { LibraryBackupService } from '../../infrastructure/library-backup-service.js';

export class AdminController {
    constructor(
        private readonly dashboard: AdminDashboard,
        private readonly backups: LibraryBackupService,
    ) {}

    getDashboard = async (
        _request: Request,
        response: Response,
    ): Promise<void> => {
        response.json(await this.dashboard.get());
    };

    backup = async (
        _request: Request,
        response: Response,
    ): Promise<void> => {
        await this.backups.streamBackup(response);
    };

    restore = async (
        request: Request,
        response: Response,
    ): Promise<void> => {
        if (!request.file) {
            response.status(400).json({ error: 'Nenhum backup enviado.' });
            return;
        }

        await this.backups.prepareRestore(request.file.path);
        response.status(202).json({
            message:
                'Restauração preparada. Reinicie o servidor para aplicá-la.',
        });
    };
}
