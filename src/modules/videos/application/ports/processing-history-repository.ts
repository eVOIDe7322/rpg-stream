export type ProcessingHistoryLevel = 'info' | 'warning' | 'error';

export interface ProcessingHistoryEntry {
    readonly id: number;
    readonly videoId: string;
    readonly level: ProcessingHistoryLevel;
    readonly event: string;
    readonly message: string;
    readonly details: string | null;
    readonly createdAt: string;
}

export interface ProcessingHistoryRepository {
    add(input: {
        videoId: string;
        level: ProcessingHistoryLevel;
        event: string;
        message: string;
        details?: string | null;
    }): Promise<void>;
    list(videoId: string): Promise<ProcessingHistoryEntry[]>;
}
