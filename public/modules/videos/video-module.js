import { videosApi } from "./api/videos-api.js";
import { renderVideoGrid } from "./ui/video-grid.js";
import { createVideoPlayer } from "./ui/video-player.js";
import {
    getErrorMessage,
    showNotification,
} from "../../shared/ui/notification.js";

const FAVORITES_STORAGE_KEY = "rpgstream:favorites";
const WATCHED_STORAGE_KEY = "rpgstream:watched";

export function createVideoModule({ getCategories, currentUser }) {
    const grid = document.querySelector("#video-grid");
    const emptyState = document.querySelector("#video-empty");
    const gridTitle = document.querySelector("#video-grid-title");
    const uploadForm = document.querySelector("#upload-form");
    const uploadButton = document.querySelector("#upload-button");
    const uploadProgress = document.querySelector("#upload-progress");
    const uploadProgressFill = document.querySelector(
        "#upload-progress-fill",
    );
    const uploadStatus = document.querySelector("#upload-status");
    const searchInput = document.querySelector("#video-search");
    const statusFilter = document.querySelector("#video-status-filter");
    const sortSelect = document.querySelector("#video-sort");
    const viewFilter = document.querySelector("#video-view-filter");
    const refreshButton = document.querySelector("#video-refresh");
    const exportButton = document.querySelector("#library-export");
    const videoCount = document.querySelector("#video-count");
    const pagination = document.querySelector("#video-pagination");
    const previousPageButton = document.querySelector("#video-previous-page");
    const nextPageButton = document.querySelector("#video-next-page");
    const pageStatus = document.querySelector("#video-page-status");
    const editDialog = document.querySelector("#video-edit-dialog");
    const editForm = document.querySelector("#video-edit-form");
    const editTitleInput = document.querySelector("#video-edit-title");
    const editCategorySelect = document.querySelector("#video-edit-category");
    const editCancelButton = document.querySelector("#video-edit-cancel");
    const editCloseButton = document.querySelector("#video-edit-close");
    const thumbnailDialog = document.querySelector("#thumbnail-dialog");
    const thumbnailForm = document.querySelector("#thumbnail-form");
    const thumbnailTimeInput = document.querySelector("#thumbnail-time");
    const thumbnailCancelButton = document.querySelector("#thumbnail-cancel");
    const thumbnailCloseButton = document.querySelector("#thumbnail-close");
    const historyDialog = document.querySelector("#history-dialog");
    const historyTitle = document.querySelector("#history-title");
    const historyList = document.querySelector("#history-list");
    const historyCloseButton = document.querySelector("#history-close");
    const markerForm = document.querySelector("#marker-form");
    const markerTitleInput = document.querySelector("#marker-title");
    const markerTimeInput = document.querySelector("#marker-time");
    const markerList = document.querySelector("#marker-list");
    const markerCurrentButton = document.querySelector("#marker-at-current-time");
    const notificationsButton = document.querySelector("#enable-notifications");
    const canEdit = ["admin", "editor"].includes(currentUser.role);
    const favoriteIds = readStoredIds(FAVORITES_STORAGE_KEY);
    const watchedIds = readStoredIds(WATCHED_STORAGE_KEY);
    const player = createVideoPlayer({
        wrapper: document.querySelector("#player-wrapper"),
        videoElement: document.querySelector("#video-player"),
        titleElement: document.querySelector("#playing-title"),
        metadataElement: document.querySelector("#playing-meta"),
        onPlaybackStarted: markWatched,
    });
    let activeVideo = null;

    const state = {
        activeCategoryId: null,
        videos: [],
        search: "",
        status: "todos",
        sort: "recentes",
        view: "todos",
        page: 1,
        pageSize: 12,
    };
    let refreshGeneration = 0;
    let pollingTimer;
    let editingVideo = null;
    let thumbnailVideo = null;

    async function refresh({ silent = false } = {}) {
        const generation = ++refreshGeneration;
        refreshButton.disabled = true;

        try {
            const videos = await videosApi.list(state.activeCategoryId);

            if (generation !== refreshGeneration) {
                return;
            }

            state.videos = videos;
            renderLibrary();
        } catch (error) {
            if (!silent) {
                showNotification(getErrorMessage(error), "error");
            }
        } finally {
            if (generation === refreshGeneration) {
                refreshButton.disabled = false;
                schedulePolling();
            }
        }
    }

    function renderLibrary() {
        const normalizedSearch = normalizeText(state.search);
        const visibleVideos = state.videos
            .filter(
                (video) =>
                    state.status === "todos" ||
                    video.status === state.status,
            )
            .filter((video) =>
                normalizeText(video.titulo).includes(normalizedSearch),
            )
            .filter((video) => {
                if (state.view === "favoritos") {
                    return favoriteIds.has(video.id);
                }

                if (state.view === "nao_assistidos") {
                    return !watchedIds.has(video.id);
                }

                return true;
            })
            .sort(compareVideos);

        const totalPages = Math.max(
            1,
            Math.ceil(visibleVideos.length / state.pageSize),
        );
        state.page = Math.min(state.page, totalPages);
        const pageStart = (state.page - 1) * state.pageSize;
        const pageVideos = visibleVideos.slice(
            pageStart,
            pageStart + state.pageSize,
        );

        renderVideoGrid(grid, emptyState, pageVideos, {
            onPlay: playVideo,
            onEdit: editVideo,
            onDelete: deleteVideo,
            onToggleFavorite: toggleFavorite,
            onChangeThumbnail: changeThumbnail,
            onPause: (video) => controlQueue(video, "pause"),
            onResume: (video) => controlQueue(video, "resume"),
            onCancel: (video) => controlQueue(video, "cancel"),
            onHistory: showHistory,
            isFavorite: (id) => favoriteIds.has(id),
            canEdit,
        });
        videoCount.textContent =
            visibleVideos.length === state.videos.length
                ? `${state.videos.length} vídeo(s)`
                : `${visibleVideos.length} de ${state.videos.length}`;
        emptyState.textContent = normalizedSearch
            ? "Nenhum vídeo corresponde à pesquisa."
            : "Nenhum vídeo encontrado nesta seleção.";
        pagination.hidden = visibleVideos.length <= state.pageSize;
        previousPageButton.disabled = state.page <= 1;
        nextPageButton.disabled = state.page >= totalPages;
        pageStatus.textContent = `Página ${state.page} de ${totalPages}`;
    }

    function compareVideos(first, second) {
        if (state.sort === "titulo") {
            return first.titulo.localeCompare(second.titulo, "pt-BR", {
                sensitivity: "base",
            });
        }

        if (state.sort === "duracao") {
            return (
                Number(second.duracao_segundos ?? 0) -
                Number(first.duracao_segundos ?? 0)
            );
        }

        return new Date(second.data_upload) - new Date(first.data_upload);
    }

    function schedulePolling() {
        window.clearTimeout(pollingTimer);

        if (
            !state.videos.some((video) =>
                ["aguardando", "processando"].includes(video.status),
            )
        ) {
            return;
        }

        pollingTimer = window.setTimeout(
            () => void refresh({ silent: true }),
            2_500,
        );
    }

    async function playVideo(video) {
        try {
            activeVideo = await videosApi.details(video.id);
            player.play(activeVideo);
            await loadMarkers(activeVideo.id);
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    async function controlQueue(video, action) {
        try {
            await videosApi[action](video.id);
            await refresh();
            showNotification(
                action === "pause"
                    ? "Conversão pausada."
                    : action === "cancel"
                      ? "Conversão cancelada."
                      : "Conversão adicionada novamente à fila.",
            );
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    async function showHistory(video) {
        historyTitle.textContent = `Histórico — ${video.titulo}`;
        historyList.textContent = "Carregando...";
        historyDialog.showModal();

        try {
            const entries = await videosApi.history(video.id);
            historyList.replaceChildren(...entries.map(createHistoryEntry));

            if (entries.length === 0) {
                historyList.textContent =
                    "Este vídeo não possui registros de processamento.";
            }
        } catch (error) {
            historyList.textContent = getErrorMessage(error);
        }
    }

    async function loadMarkers(videoId) {
        const markers = await videosApi.markers(videoId);
        markerList.replaceChildren(
            ...markers.map((marker) => createMarker(marker, videoId)),
        );

        if (markers.length === 0) {
            markerList.textContent = "Nenhum marcador nesta sessão.";
        }
    }

    function createMarker(marker, videoId) {
        const item = document.createElement("div");
        item.className = "marker-item";
        const seek = document.createElement("button");
        seek.type = "button";
        seek.className = "marker-item__seek";
        seek.textContent = `${formatMarkerTime(marker.timeSeconds)} — ${marker.title}`;
        seek.addEventListener("click", () => player.seekTo(marker.timeSeconds));
        item.append(seek);

        if (canEdit) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "marker-item__delete";
            remove.setAttribute("aria-label", `Excluir marcador ${marker.title}`);
            remove.textContent = "×";
            remove.addEventListener("click", async () => {
                try {
                    await videosApi.deleteMarker(videoId, marker.id);
                    await loadMarkers(videoId);
                } catch (error) {
                    showNotification(getErrorMessage(error), "error");
                }
            });
            item.append(remove);
        }

        return item;
    }

    async function submitMarker(event) {
        event.preventDefault();

        if (!activeVideo) {
            return;
        }

        try {
            await videosApi.addMarker(activeVideo.id, {
                titulo: markerTitleInput.value,
                tempo_segundos: Number(markerTimeInput.value),
            });
            markerForm.reset();
            await loadMarkers(activeVideo.id);
            showNotification("Marcador adicionado.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    function connectProcessingEvents() {
        const source = new EventSource("/events");

        for (const type of ["completed", "failed"]) {
            source.addEventListener(type, (event) => {
                const payload = JSON.parse(event.data);
                const message =
                    type === "completed"
                        ? `${payload.title || "Vídeo"} terminou de processar.`
                        : `${payload.title || "Vídeo"} falhou no processamento.`;
                showNotification(message, type === "failed" ? "error" : "info");
                showSystemNotification(message);
                void refresh({ silent: true });
            });
        }
    }

    async function enableSystemNotifications() {
        if (!("Notification" in window)) {
            showNotification("Este navegador não oferece notificações.", "error");
            return;
        }

        const permission = await Notification.requestPermission();
        notificationsButton.textContent =
            permission === "granted" ? "Notificações ativas" : "Notificações";
    }

    function showSystemNotification(message) {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("RPGStream", { body: message });
        }
    }

    function markWatched(videoId) {
        watchedIds.add(videoId);
        saveStoredIds(WATCHED_STORAGE_KEY, watchedIds);

        if (state.view === "nao_assistidos") {
            renderLibrary();
        }
    }

    function toggleFavorite(video) {
        if (favoriteIds.has(video.id)) {
            favoriteIds.delete(video.id);
        } else {
            favoriteIds.add(video.id);
        }

        saveStoredIds(FAVORITES_STORAGE_KEY, favoriteIds);
        renderLibrary();
    }

    function changeThumbnail(video) {
        thumbnailVideo = video;
        const suggestedTime = Math.round(
            Number(video.duracao_segundos ?? 0) * 0.1,
        );
        thumbnailTimeInput.value = String(suggestedTime);
        thumbnailTimeInput.max = String(
            Math.max(0, Math.ceil(video.duracao_segundos ?? 0) - 1),
        );
        thumbnailDialog.showModal();
        thumbnailTimeInput.focus();
    }

    async function submitThumbnail(event) {
        event.preventDefault();

        if (!thumbnailVideo) {
            return;
        }

        const timeSeconds = Number(thumbnailTimeInput.value);

        if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
            showNotification("Informe um momento válido.", "error");
            return;
        }

        try {
            await videosApi.updateThumbnail(thumbnailVideo.id, timeSeconds);
            thumbnailDialog.close();
            thumbnailVideo = null;
            await refresh();
            showNotification("Capa atualizada.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    function closeThumbnailDialog() {
        thumbnailDialog.close();
        thumbnailVideo = null;
    }

    function editVideo(video) {
        editingVideo = video;
        const categories = getCategories();
        const options = [
            { id: "", nome: "Sem categoria" },
            ...categories.map((category) => ({
                id: String(category.id),
                nome: category.nome,
            })),
        ].map((category) => {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.nome;
            option.selected =
                category.id === String(video.categoria_id ?? "");
            return option;
        });

        editTitleInput.value = video.titulo;
        editCategorySelect.replaceChildren(...options);
        editDialog.showModal();
        editTitleInput.focus();
    }

    async function submitEdit(event) {
        event.preventDefault();

        if (!editingVideo) {
            return;
        }

        const title = editTitleInput.value.trim();

        if (!title) {
            showNotification("Informe um título para o vídeo.", "error");
            return;
        }

        const categoryId = editCategorySelect.value
            ? Number(editCategorySelect.value)
            : null;

        try {
            await videosApi.update(editingVideo.id, {
                titulo: title,
                categoria_id: categoryId,
            });
            editDialog.close();
            editingVideo = null;
            await refresh();
            showNotification("Vídeo atualizado.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    function closeEditDialog() {
        editDialog.close();
        editingVideo = null;
    }

    async function deleteVideo(video) {
        if (
            !window.confirm(
                "Mover este vídeo para a lixeira? Ele poderá ser recuperado durante o prazo configurado.",
            )
        ) {
            return;
        }

        try {
            await videosApi.remove(video.id);
            favoriteIds.delete(video.id);
            watchedIds.delete(video.id);
            saveStoredIds(FAVORITES_STORAGE_KEY, favoriteIds);
            saveStoredIds(WATCHED_STORAGE_KEY, watchedIds);
            await refresh();
            showNotification("Vídeo movido para a lixeira.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    function updateProgress(value) {
        uploadProgress.hidden = false;
        uploadProgress.setAttribute("aria-valuenow", String(value));
        uploadProgressFill.style.width = `${value}%`;
        uploadStatus.textContent = `Enviando: ${value}%`;
    }

    async function submitUpload(event) {
        event.preventDefault();
        const formData = new FormData();
        const file = document.querySelector("#upload-file").files[0];

        if (!file) {
            showNotification("Selecione um arquivo de vídeo.", "error");
            return;
        }

        formData.append("video", file);
        formData.append(
            "titulo",
            document.querySelector("#upload-title-input").value,
        );
        formData.append(
            "categoria_id",
            document.querySelector("#upload-category").value,
        );

        uploadButton.disabled = true;

        try {
            const result = await videosApi.upload(formData, updateProgress);
            uploadStatus.textContent =
                "Upload concluído. A conversão está sendo acompanhada abaixo.";
            uploadForm.reset();
            state.sort = "recentes";
            state.page = 1;
            sortSelect.value = state.sort;
            await refresh();

            const uploadedCard = grid.querySelector(
                `.video-card[data-video-id="${CSS.escape(result.videoId)}"]`,
            );
            uploadedCard?.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (error) {
            uploadStatus.textContent = "";
            showNotification(getErrorMessage(error), "error");
        } finally {
            uploadButton.disabled = false;
            window.setTimeout(() => {
                uploadProgress.setAttribute("aria-valuenow", "0");
                uploadProgressFill.style.width = "0%";
                uploadProgress.hidden = true;
            }, 1_500);
        }
    }

    async function exportLibrary() {
        exportButton.disabled = true;

        try {
            const videos = await videosApi.list();
            const catalog = {
                exportedAt: new Date().toISOString(),
                categories: getCategories(),
                videos,
            };
            const blob = new Blob(
                [JSON.stringify(catalog, null, 2)],
                { type: "application/json" },
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `rpgstream-catalogo-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
            showNotification("Catálogo exportado com sucesso.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        } finally {
            exportButton.disabled = false;
        }
    }

    return {
        async initialize() {
            uploadForm.addEventListener("submit", submitUpload);
            document.querySelector("#upload-section").hidden = !canEdit;
            markerForm.hidden = !canEdit;
            markerCurrentButton.hidden = !canEdit;
            markerForm.addEventListener("submit", submitMarker);
            markerCurrentButton.addEventListener("click", () => {
                markerTimeInput.value = String(player.getCurrentTime());
                markerTitleInput.focus();
            });
            historyCloseButton.addEventListener("click", () =>
                historyDialog.close(),
            );
            notificationsButton.addEventListener(
                "click",
                enableSystemNotifications,
            );
            editForm.addEventListener("submit", submitEdit);
            editCancelButton.addEventListener("click", closeEditDialog);
            editCloseButton.addEventListener("click", closeEditDialog);
            thumbnailForm.addEventListener("submit", submitThumbnail);
            thumbnailCancelButton.addEventListener(
                "click",
                closeThumbnailDialog,
            );
            thumbnailCloseButton.addEventListener(
                "click",
                closeThumbnailDialog,
            );
            searchInput.addEventListener("input", () => {
                state.search = searchInput.value;
                state.page = 1;
                renderLibrary();
            });
            statusFilter.addEventListener("change", () => {
                state.status = statusFilter.value;
                state.page = 1;
                renderLibrary();
            });
            sortSelect.addEventListener("change", () => {
                state.sort = sortSelect.value;
                state.page = 1;
                renderLibrary();
            });
            viewFilter.addEventListener("change", () => {
                state.view = viewFilter.value;
                state.page = 1;
                renderLibrary();
            });
            refreshButton.addEventListener("click", () => void refresh());
            exportButton.addEventListener("click", () => void exportLibrary());
            previousPageButton.addEventListener("click", () => {
                state.page = Math.max(1, state.page - 1);
                renderLibrary();
                grid.scrollIntoView({ behavior: "smooth", block: "start" });
            });
            nextPageButton.addEventListener("click", () => {
                state.page += 1;
                renderLibrary();
                grid.scrollIntoView({ behavior: "smooth", block: "start" });
            });
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") {
                    void refresh({ silent: true });
                }
            });
            await refresh();
            connectProcessingEvents();
        },

        async selectCategory(selection) {
            state.activeCategoryId = selection.id;
            state.page = 1;
            gridTitle.textContent = selection.name;
            await refresh();
        },

        refresh,
    };
}

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}

function readStoredIds(key) {
    try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
        return new Set(Array.isArray(value) ? value : []);
    } catch {
        return new Set();
    }
}

function saveStoredIds(key, values) {
    try {
        window.localStorage.setItem(key, JSON.stringify([...values]));
    } catch {
        // A biblioteca continua funcionando sem persistência local.
    }
}

function createHistoryEntry(entry) {
    const article = document.createElement("article");
    article.className = `history-entry history-entry--${entry.level}`;
    const heading = document.createElement("div");
    heading.className = "history-entry__heading";
    const message = document.createElement("strong");
    message.textContent = entry.message;
    const date = document.createElement("time");
    date.textContent = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
    }).format(new Date(entry.createdAt));
    heading.append(message, date);
    article.append(heading);

    if (entry.details) {
        const details = document.createElement("pre");
        details.textContent = entry.details;
        article.append(details);
    }

    return article;
}

function formatMarkerTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
