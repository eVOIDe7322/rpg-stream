export class DomainValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DomainValidationError';
    }
}

export class EntityNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EntityNotFoundError';
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}
