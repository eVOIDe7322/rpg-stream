export function createVideoPlayer({
    wrapper,
    videoElement,
    titleElement,
    metadataElement,
    onPlaybackStarted = () => {},
}) {
    let hls;
    let activeVideoId = null;
    let lastSavedSecond = -1;

    function storageKey(videoId) {
        return `rpgstream:playback:${videoId}`;
    }

    function readSavedPosition(videoId) {
        try {
            const value = Number(window.localStorage.getItem(storageKey(videoId)));
            return Number.isFinite(value) ? value : 0;
        } catch {
            return 0;
        }
    }

    function savePosition() {
        if (!activeVideoId || !Number.isFinite(videoElement.currentTime)) {
            return;
        }

        const second = Math.floor(videoElement.currentTime);

        if (second === lastSavedSecond) {
            return;
        }

        lastSavedSecond = second;

        try {
            window.localStorage.setItem(
                storageKey(activeVideoId),
                String(videoElement.currentTime),
            );
        } catch {
            // A reprodução continua mesmo se o armazenamento estiver indisponível.
        }
    }

    function clearSavedPosition() {
        if (!activeVideoId) {
            return;
        }

        try {
            window.localStorage.removeItem(storageKey(activeVideoId));
        } catch {
            // Ignora bloqueios de armazenamento do navegador.
        }
    }

    videoElement.addEventListener("timeupdate", savePosition);
    videoElement.addEventListener("pause", savePosition);
    videoElement.addEventListener("ended", clearSavedPosition);

    function loadSource(source) {
        if (window.Hls?.isSupported()) {
            hls?.destroy();
            hls = new window.Hls();
            hls.loadSource(source);
            hls.attachMedia(videoElement);
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                void videoElement.play();
            });
            return;
        }

        if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
            videoElement.src = source;
            void videoElement.play();
            return;
        }

        throw new Error("Este navegador não oferece suporte à reprodução HLS.");
    }

    return {
        play(video) {
            savePosition();
            activeVideoId = video.id;
            onPlaybackStarted(video.id);
            lastSavedSecond = -1;
            wrapper.hidden = false;
            titleElement.textContent = video.titulo;
            metadataElement.textContent = [
                video.categoria_nome || "Sem categoria",
                formatDate(video.data_upload),
                formatDuration(video.duracao_segundos),
                formatResolution(video.largura, video.altura),
            ].filter(Boolean).join(" • ");

            const savedPosition = readSavedPosition(video.id);
            videoElement.addEventListener(
                "loadedmetadata",
                () => {
                    if (
                        savedPosition > 5 &&
                        savedPosition < videoElement.duration - 10
                    ) {
                        videoElement.currentTime = savedPosition;
                    }
                },
                { once: true },
            );
            loadSource(
                video.caminho_playlist ??
                    `/videos/${encodeURIComponent(video.id)}/playlist.m3u8`,
            );
            window.scrollTo({ top: 0, behavior: "smooth" });
        },

        getCurrentTime() {
            return Number(videoElement.currentTime.toFixed(1));
        },

        seekTo(timeSeconds) {
            videoElement.currentTime = Number(timeSeconds);
            void videoElement.play();
        },
    };
}

function formatDuration(value) {
    const totalSeconds = Math.round(Number(value));

    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return "";
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatResolution(width, height) {
    return width && height ? `${width}×${height}` : "";
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
        ? value
        : new Intl.DateTimeFormat("pt-BR").format(date);
}
