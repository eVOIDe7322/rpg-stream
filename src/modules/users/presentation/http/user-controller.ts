import { Request, Response } from 'express';
import { UserService } from '../../application/user-service.js';

export class UserController {
    constructor(private readonly users: UserService) {}

    me = (request: Request, response: Response): void => {
        response.json(request.user);
    };

    list = async (_request: Request, response: Response): Promise<void> => {
        response.json(await this.users.list());
    };

    create = async (request: Request, response: Response): Promise<void> => {
        const id = await this.users.create(
            request.body?.nome,
            request.body?.senha,
            request.body?.papel,
        );
        response.status(201).json({ id });
    };

    update = async (request: Request, response: Response): Promise<void> => {
        await this.users.update(Number(request.params.id), {
            role: request.body?.papel,
            active: request.body?.ativo,
            password: request.body?.senha,
        });
        response.json({ message: 'Usuário atualizado.' });
    };
}
