import {
    randomBytes,
    scrypt as nodeScrypt,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import {
    ConflictError,
    DomainValidationError,
    EntityNotFoundError,
} from '../../../shared/domain/errors.js';
import { UserRepository } from '../domain/user-repository.js';
import { AuthenticatedUser, UserRole } from '../domain/user.js';

const scrypt = promisify(nodeScrypt);
const validRoles = new Set<UserRole>(['admin', 'editor', 'viewer']);

export class UserService {
    constructor(private readonly users: UserRepository) {}

    async bootstrap(
        name: string | null,
        password: string | null,
    ): Promise<boolean> {
        const userCount = await this.users.count();

        if (!name || !password) {
            return userCount > 0;
        }

        const configuredUser = await this.users.findByName(name.trim());

        if (!configuredUser) {
            await this.create(name, password, 'admin');
            console.log(`Usuário administrador "${name}" criado.`);
            return true;
        }

        const authenticated = await this.authenticate(name, password);

        if (
            !authenticated ||
            !configuredUser.active ||
            configuredUser.role !== 'admin'
        ) {
            await this.update(configuredUser.id, {
                password,
                role: 'admin',
                active: true,
            });
            console.log(
                `Usuário administrador "${configuredUser.name}" sincronizado com a configuração.`,
            );
        }

        return true;
    }

    async authenticate(
        name: string,
        password: string,
    ): Promise<AuthenticatedUser | null> {
        const user = await this.users.findByName(name.trim());

        if (!user || !user.active) {
            return null;
        }

        const candidate = (await scrypt(
            password,
            Buffer.from(user.passwordSalt, 'hex'),
            64,
        )) as Buffer;
        const expected = Buffer.from(user.passwordHash, 'hex');

        if (
            candidate.length !== expected.length ||
            !timingSafeEqual(candidate, expected)
        ) {
            return null;
        }

        return { id: user.id, name: user.name, role: user.role };
    }

    async create(
        name: string,
        password: string,
        role: UserRole,
    ): Promise<number> {
        const normalizedName = String(name ?? '').trim();

        if (!/^[\p{L}\p{N}._-]{3,40}$/u.test(normalizedName)) {
            throw new DomainValidationError(
                'O usuário deve ter de 3 a 40 caracteres válidos.',
            );
        }

        if (String(password ?? '').length < 8) {
            throw new DomainValidationError(
                'A senha deve ter pelo menos 8 caracteres.',
            );
        }

        if (!validRoles.has(role)) {
            throw new DomainValidationError('Papel de usuário inválido.');
        }

        if (await this.users.findByName(normalizedName)) {
            throw new ConflictError('Este nome de usuário já existe.');
        }

        const credentials = await this.hashPassword(password);
        return this.users.add({
            name: normalizedName,
            role,
            ...credentials,
        });
    }

    async list() {
        const users = await this.users.list();
        return users.map(({ passwordHash, passwordSalt, ...user }) => user);
    }

    async update(
        id: number,
        changes: { role?: UserRole; active?: boolean; password?: string },
    ): Promise<void> {
        if (changes.role !== undefined && !validRoles.has(changes.role)) {
            throw new DomainValidationError('Papel de usuário inválido.');
        }

        const currentUsers = await this.users.list();
        const target = currentUsers.find((user) => user.id === id);

        if (!target) {
            throw new EntityNotFoundError('Usuário não encontrado.');
        }

        if (
            target.active &&
            target.role === 'admin' &&
            (changes.active === false ||
                (changes.role !== undefined && changes.role !== 'admin')) &&
            !currentUsers.some(
                (user) =>
                    user.id !== id && user.active && user.role === 'admin',
            )
        ) {
            throw new DomainValidationError(
                'Não é possível desativar ou rebaixar o último administrador ativo.',
            );
        }

        const passwordChanges = changes.password
            ? await this.hashPassword(changes.password)
            : {};
        const updated = await this.users.update(id, {
            role: changes.role,
            active: changes.active,
            ...passwordChanges,
        });

        if (!updated) {
            throw new DomainValidationError(
                'Nenhuma alteração de usuário foi informada.',
            );
        }
    }

    private async hashPassword(password: string): Promise<{
        passwordHash: string;
        passwordSalt: string;
    }> {
        if (password.length < 8) {
            throw new DomainValidationError(
                'A senha deve ter pelo menos 8 caracteres.',
            );
        }

        const salt = randomBytes(16);
        const hash = (await scrypt(password, salt, 64)) as Buffer;
        return {
            passwordHash: hash.toString('hex'),
            passwordSalt: salt.toString('hex'),
        };
    }
}
