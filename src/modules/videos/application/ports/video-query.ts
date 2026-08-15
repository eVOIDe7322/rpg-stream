import { VideoStatus } from '../../domain/video.js';

export interface VideoListItem {
    readonly id: string;
    readonly titulo: string;
    readonly caminho_playlist: string | null;
    readonly caminho_thumbnail: string;
    readonly categoria_id: number | null;
    readonly data_upload: string;
    readonly status: VideoStatus;
    readonly progresso: number;
    readonly duracao_segundos: number | null;
    readonly largura: number | null;
    readonly altura: number | null;
    readonly tamanho_bytes: number | null;
    readonly mensagem_erro: string | null;
}

export interface VideoDetails extends VideoListItem {
    readonly categoria_nome: string | null;
}

export interface VideoQuery {
    findAll(categoryId?: number): Promise<VideoListItem[]>;
    findDetails(id: string): Promise<VideoDetails | null>;
}
