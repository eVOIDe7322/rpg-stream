import { Request, Response } from 'express';
import { ProcessingEventBus } from '../../application/processing-event-bus.js';

export class ProcessingEventController {
    constructor(private readonly events: ProcessingEventBus) {}

    connect = (request: Request, response: Response): void => {
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Connection', 'keep-alive');
        response.flushHeaders();
        response.write('retry: 3000\n\n');

        const unsubscribe = this.events.subscribe((event) => {
            response.write(`event: ${event.type}\n`);
            response.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        const keepAlive = setInterval(() => {
            response.write(': keep-alive\n\n');
        }, 20_000);

        request.once('close', () => {
            clearInterval(keepAlive);
            unsubscribe();
        });
    };
}
