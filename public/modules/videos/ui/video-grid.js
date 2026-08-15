const STATUS_PRESENTATION = {
    concluido: { label: "Pronto", icon: "▶" },
    aguardando: { label: "Na fila", icon: "…" },
    processando: { label: "Processando", icon: "" },
    pausado: { label: "Pausado", icon: "Ⅱ" },
    cancelado: { label: "Cancelado", icon: "×" },
    erro: { label: "Com erro", icon: "!" },
};

function createAction(label, modifier, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `video-action video-action--${modifier}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function createThumbnail(video, actions) {
    const thumbnail = document.createElement("button");
    thumbnail.type = "button";
    thumbnail.className = "video-thumbnail";
    const presentation = STATUS_PRESENTATION[video.status];

    if (video.status === "concluido" && actions.canEdit) {
        thumbnail.setAttribute("aria-label", `Reproduzir ${video.titulo}`);

        const image = document.createElement("img");
        image.className = "video-thumbnail__image";
        image.src =
            video.caminho_thumbnail ??
            `/videos/${encodeURIComponent(video.id)}/thumbnail.jpg`;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", () => {
            image.remove();
            thumbnail.classList.add("video-thumbnail--fallback");
        });
        thumbnail.append(image);
        thumbnail.addEventListener("click", () => actions.onPlay(video));
    } else {
        thumbnail.disabled = true;
        thumbnail.setAttribute("aria-label", presentation.label);
    }

    const statusIcon = document.createElement("span");
    statusIcon.className = `video-thumbnail__status video-thumbnail__status--${video.status}`;
    statusIcon.setAttribute("aria-hidden", "true");
    statusIcon.textContent = presentation.icon;
    thumbnail.append(statusIcon);

    if (video.status === "processando" && actions.canEdit) {
        const progress = document.createElement("div");
        progress.className = "video-thumbnail__progress";
        progress.setAttribute("aria-hidden", "true");

        const fill = document.createElement("div");
        fill.className = "video-thumbnail__progress-fill";
        fill.style.width = `${Math.max(0, Math.min(100, video.progresso ?? 0))}%`;
        progress.append(fill);
        thumbnail.append(progress);
    }

    return thumbnail;
}

function createVideoCard(video, actions) {
    const card = document.createElement("article");
    card.className = `video-card video-card--${video.status}`;
    card.dataset.videoId = video.id;

    const information = document.createElement("div");
    information.className = "video-card__information";

    const heading = document.createElement("div");
    heading.className = "video-card__heading";

    const title = document.createElement("h3");
    title.className = "video-card__title";
    title.textContent = video.titulo;
    title.title = video.titulo;

    const status = document.createElement("span");
    status.className = `video-status video-status--${video.status}`;
    status.textContent =
        video.status === "processando"
            ? `${Math.round(video.progresso ?? 0)}%`
            : STATUS_PRESENTATION[video.status].label;
    heading.append(title, status);

    const metadata = document.createElement("p");
    metadata.className = "video-card__metadata";
    metadata.textContent = [
        formatDuration(video.duracao_segundos),
        formatResolution(video.largura, video.altura),
        formatFileSize(video.tamanho_bytes),
        formatDate(video.data_upload),
    ].filter(Boolean).join(" • ");

    information.append(heading, metadata);

    if (video.status === "erro") {
        const error = document.createElement("p");
        error.className = "video-card__error";
        error.textContent =
            video.mensagem_erro || "Não foi possível processar este vídeo.";
        information.append(error);
    }

    const actionBar = document.createElement("div");
    actionBar.className = "video-card__actions";
    actionBar.append(
        createAction(
            actions.isFavorite(video.id) ? "★ Favorito" : "☆ Favoritar",
            "favorite",
            () => actions.onToggleFavorite(video),
        ),
    );

    if (video.status === "concluido") {
        actionBar.append(
            createAction("Capa", "thumbnail", () =>
                actions.onChangeThumbnail(video),
            ),
        );
    }

    if (video.status === "processando") {
        actionBar.append(
            createAction("Pausar", "pause", () => actions.onPause(video)),
            createAction("Cancelar", "cancel", () => actions.onCancel(video)),
        );
    }

    if (video.status === "aguardando" && actions.canEdit) {
        actionBar.append(
            createAction("Pausar", "pause", () => actions.onPause(video)),
            createAction("Cancelar", "cancel", () => actions.onCancel(video)),
        );
    }

    if (
        actions.canEdit &&
        ["pausado", "cancelado", "erro"].includes(video.status)
    ) {
        actionBar.append(
            createAction("Retomar", "resume", () => actions.onResume(video)),
        );
    }

    if (video.status !== "concluido" || video.progresso > 0) {
        actionBar.append(
            createAction("Histórico", "history", () => actions.onHistory(video)),
        );
    }

    if (actions.canEdit) {
        actionBar.append(
            createAction("Editar", "edit", () => actions.onEdit(video)),
            createAction("Excluir", "delete", () => actions.onDelete(video)),
        );
    }
    information.append(actionBar);

    card.append(createThumbnail(video, actions), information);
    return card;
}

export function renderVideoGrid(container, emptyState, videos, actions) {
    const cards = videos.map((video) => createVideoCard(video, actions));
    container.replaceChildren(...cards);
    emptyState.hidden = cards.length > 0;
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
        ? `${hours}h ${String(minutes).padStart(2, "0")}min`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatResolution(width, height) {
    return width && height ? `${width}×${height}` : "";
}

function formatFileSize(value) {
    const bytes = Number(value);

    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    const amount = bytes / 1024 ** exponent;
    return `${amount.toLocaleString("pt-BR", {
        maximumFractionDigits: exponent > 1 ? 1 : 0,
    })} ${units[exponent]}`;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
        ? ""
        : new Intl.DateTimeFormat("pt-BR").format(date);
}
