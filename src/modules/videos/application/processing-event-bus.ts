import { EventEmitter } from 'node:events';

export interface ProcessingEvent {
    readonly type: 'queue' | 'completed' | 'failed' | 'trashed';
    readonly videoId: string;
    readonly title?: string;
    readonly message?: string;
    readonly occurredAt: string;
}

export class ProcessingEventBus {
    private readonly events = new EventEmitter();

    publish(event: Omit<ProcessingEvent, 'occurredAt'>): void {
        this.events.emit('processing', {
            ...event,
            occurredAt: new Date().toISOString(),
        } satisfies ProcessingEvent);
    }

    subscribe(listener: (event: ProcessingEvent) => void): () => void {
        this.events.on('processing', listener);
        return () => this.events.off('processing', listener);
    }
}
