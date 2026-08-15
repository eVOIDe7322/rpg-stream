import { AuthenticatedUser } from '../modules/users/domain/user.js';

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

export {};
