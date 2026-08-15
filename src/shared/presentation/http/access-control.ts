import { RequestHandler } from 'express';
import { UserRole } from '../../../modules/users/domain/user.js';
import { UserService } from '../../../modules/users/application/user-service.js';

export function createAccessControl(
    users: UserService,
    authenticationEnabled: boolean,
): RequestHandler {
    return async (request, response, next) => {
        if (!authenticationEnabled) {
            request.user = { id: 0, name: 'local', role: 'admin' };
            next();
            return;
        }

        try {
            const authorization = request.headers.authorization;

            if (authorization?.startsWith('Basic ')) {
                const credentials = Buffer.from(
                    authorization.slice('Basic '.length),
                    'base64',
                ).toString('utf8');
                const separator = credentials.indexOf(':');
                const user = await users.authenticate(
                    separator >= 0 ? credentials.slice(0, separator) : '',
                    separator >= 0 ? credentials.slice(separator + 1) : '',
                );

                if (user) {
                    request.user = user;
                    next();
                    return;
                }
            }

            response.setHeader(
                'WWW-Authenticate',
                'Basic realm="RPGStream", charset="UTF-8"',
            );
            response.status(401).json({ error: 'Autenticação necessária.' });
        } catch (error) {
            next(error);
        }
    };
}

export function requireRoles(...roles: UserRole[]): RequestHandler {
    return (request, response, next) => {
        if (request.user && roles.includes(request.user.role)) {
            next();
            return;
        }

        response.status(403).json({
            error: 'Você não possui permissão para esta operação.',
        });
    };
}

export function protectMutations(...roles: UserRole[]): RequestHandler {
    return (request, response, next) => {
        if (request.method === 'GET' || request.method === 'HEAD') {
            next();
            return;
        }

        requireRoles(...roles)(request, response, next);
    };
}
