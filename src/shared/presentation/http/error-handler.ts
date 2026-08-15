import { ErrorRequestHandler } from 'express';
import {
    ConflictError,
    DomainValidationError,
    EntityNotFoundError,
} from '../../domain/errors.js';

interface SqliteError extends Error {
    readonly code?: string;
    readonly status?: number;
}

export const errorHandler: ErrorRequestHandler = (
    error: SqliteError,
    _request,
    response,
    _next,
) => {
    if (error instanceof DomainValidationError) {
        response.status(400).json({ error: error.message });
        return;
    }

    if (error instanceof EntityNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
    }

    if (
        error instanceof ConflictError ||
        error.code === 'SQLITE_CONSTRAINT'
    ) {
        response.status(409).json({ error: error.message });
        return;
    }

    if (error.status === 400) {
        response.status(400).json({ error: 'Requisição inválida.' });
        return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
        response.status(413).json({
            error: 'O arquivo ultrapassa o limite permitido para upload.',
        });
        return;
    }

    console.error(error);
    response.status(500).json({ error: 'Erro interno do servidor.' });
};
