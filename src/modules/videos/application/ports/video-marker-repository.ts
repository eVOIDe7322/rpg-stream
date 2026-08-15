export interface VideoMarker {
    readonly id: number;
    readonly videoId: string;
    readonly title: string;
    readonly timeSeconds: number;
    readonly createdBy: number | null;
    readonly createdAt: string;
}

export interface VideoMarkerRepository {
    add(input: {
        videoId: string;
        title: string;
        timeSeconds: number;
        createdBy: number | null;
    }): Promise<VideoMarker>;
    list(videoId: string): Promise<VideoMarker[]>;
    delete(id: number, videoId: string): Promise<boolean>;
}
