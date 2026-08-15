import { StoredUser, UserRole } from './user.js';

export interface UserRepository {
    count(): Promise<number>;
    findByName(name: string): Promise<StoredUser | null>;
    list(): Promise<readonly StoredUser[]>;
    add(input: {
        name: string;
        passwordHash: string;
        passwordSalt: string;
        role: UserRole;
    }): Promise<number>;
    update(
        id: number,
        changes: {
            role?: UserRole;
            active?: boolean;
            passwordHash?: string;
            passwordSalt?: string;
        },
    ): Promise<boolean>;
}
