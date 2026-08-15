export type UserRole = 'admin' | 'editor' | 'viewer';

export interface AuthenticatedUser {
    readonly id: number;
    readonly name: string;
    readonly role: UserRole;
}

export interface StoredUser extends AuthenticatedUser {
    readonly passwordHash: string;
    readonly passwordSalt: string;
    readonly active: boolean;
    readonly createdAt: string;
}
