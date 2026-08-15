export type VideoJobState =
    | 'aguardando'
    | 'processando'
    | 'pausado'
    | 'cancelado'
    | 'erro';

export interface VideoJob {
    readonly videoId: string;
    readonly temporaryFile: string;
    readonly state: VideoJobState;
    readonly attempts: number;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface VideoJobRepository {
    add(videoId: string, temporaryFile: string): Promise<void>;
    find(videoId: string): Promise<VideoJob | null>;
    findByStates(states: readonly VideoJobState[]): Promise<VideoJob[]>;
    updateState(videoId: string, state: VideoJobState): Promise<void>;
    startAttempt(videoId: string): Promise<void>;
    delete(videoId: string): Promise<void>;
    findProtectedTemporaryFiles(): Promise<string[]>;
}
