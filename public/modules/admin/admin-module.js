import { adminApi } from "./api/admin-api.js";
import { videosApi } from "../videos/api/videos-api.js";
import {
    getErrorMessage,
    showNotification,
} from "../../shared/ui/notification.js";

export function createAdminModule({ currentUser, onLibraryChanged }) {
    const panel = document.querySelector("#admin-panel");

    if (currentUser.role !== "admin") {
        panel.hidden = true;
        return { initialize: async () => {} };
    }

    const storageText = document.querySelector("#admin-storage");
    const queueText = document.querySelector("#admin-queue");
    const errorText = document.querySelector("#admin-errors");
    const trashText = document.querySelector("#admin-trash-summary");
    const categories = document.querySelector("#admin-category-storage");
    const largest = document.querySelector("#admin-largest-videos");
    const trashList = document.querySelector("#admin-trash-list");
    const userList = document.querySelector("#admin-user-list");
    const userForm = document.querySelector("#admin-user-form");
    const restoreForm = document.querySelector("#admin-restore-form");
    const backupButton = document.querySelector("#admin-backup-button");
    const refreshButton = document.querySelector("#admin-refresh");

    async function refresh() {
        refreshButton.disabled = true;

        try {
            const [dashboard, trash, users] = await Promise.all([
                adminApi.dashboard(),
                videosApi.trash(),
                adminApi.users(),
            ]);
            renderDashboard(dashboard);
            renderTrash(trash);
            renderUsers(users);
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        } finally {
            refreshButton.disabled = false;
        }
    }

    function renderDashboard(data) {
        storageText.textContent = `${formatBytes(data.storage.availableBytes)} livres de ${formatBytes(data.storage.totalBytes)}`;
        queueText.textContent = [
            `${data.queue.processando ?? 0} processando`,
            `${data.queue.aguardando ?? 0} aguardando`,
            `${data.queue.pausado ?? 0} pausado(s)`,
        ].join(" • ");
        errorText.textContent = `${data.processingErrorCount} registro(s)`;
        trashText.textContent = `${data.trash.videoCount} vídeo(s) • ${formatBytes(data.trash.sizeBytes)}`;

        categories.replaceChildren(
            ...data.categories.map((category) =>
                createMetricRow(
                    category.name,
                    `${category.videoCount} vídeo(s)`,
                    formatBytes(category.sizeBytes),
                ),
            ),
        );
        largest.replaceChildren(
            ...data.largestVideos.map((video) =>
                createMetricRow(
                    video.title,
                    formatDuration(video.durationSeconds),
                    formatBytes(video.sizeBytes),
                ),
            ),
        );
    }

    function renderTrash(videos) {
        trashList.replaceChildren(
            ...videos.map((video) => {
                const row = createMetricRow(
                    video.title,
                    `Expira em ${formatDate(video.purgeAfter)}`,
                    formatBytes(video.sizeBytes),
                );
                const actions = document.createElement("div");
                actions.className = "admin-row__actions";
                actions.append(
                    createButton("Restaurar", async () => {
                        await videosApi.restore(video.id);
                        await Promise.all([refresh(), onLibraryChanged()]);
                        showNotification("Vídeo restaurado.");
                    }),
                    createButton("Excluir agora", async () => {
                        if (!window.confirm("Excluir este vídeo definitivamente?")) {
                            return;
                        }

                        await videosApi.purge(video.id);
                        await refresh();
                        showNotification("Vídeo excluído definitivamente.");
                    }, "danger"),
                );
                row.append(actions);
                return row;
            }),
        );

        if (videos.length === 0) {
            trashList.textContent = "A lixeira está vazia.";
        }
    }

    function renderUsers(users) {
        userList.replaceChildren(
            ...users.map((user) => {
                const row = createMetricRow(
                    user.name,
                    user.role,
                    user.active ? "Ativo" : "Desativado",
                );
                const button = createButton(
                    user.active ? "Desativar" : "Ativar",
                    async () => {
                        await adminApi.updateUser(user.id, {
                            ativo: !user.active,
                        });
                        await refresh();
                    },
                    user.active ? "danger" : "default",
                );
                row.append(button);
                return row;
            }),
        );
    }

    async function submitUser(event) {
        event.preventDefault();
        const form = new FormData(userForm);

        try {
            await adminApi.createUser({
                nome: form.get("nome"),
                senha: form.get("senha"),
                papel: form.get("papel"),
            });
            userForm.reset();
            await refresh();
            showNotification("Usuário criado.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    async function submitRestore(event) {
        event.preventDefault();

        if (
            !window.confirm(
                "Preparar esta restauração? Ela substituirá a biblioteca no próximo reinício.",
            )
        ) {
            return;
        }

        const form = new FormData(restoreForm);

        try {
            const result = await adminApi.restore(form);
            restoreForm.reset();
            showNotification(result.message);
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    return {
        async initialize() {
            panel.hidden = false;
            userForm.addEventListener("submit", submitUser);
            restoreForm.addEventListener("submit", submitRestore);
            refreshButton.addEventListener("click", () => void refresh());
            backupButton.addEventListener("click", () => {
                window.location.assign("/admin/backup");
            });
            await refresh();
        },
        refresh,
    };
}

function createMetricRow(title, subtitle, value) {
    const row = document.createElement("article");
    row.className = "admin-row";
    const content = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = subtitle;
    content.append(heading, detail);
    const metric = document.createElement("span");
    metric.className = "admin-row__metric";
    metric.textContent = value;
    row.append(content, metric);
    return row;
}

function createButton(label, action, modifier = "default") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `admin-action admin-action--${modifier}`;
    button.textContent = label;
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            await action();
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        } finally {
            button.disabled = false;
        }
    });
    return button;
}

function formatBytes(value) {
    const bytes = Number(value ?? 0);
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    return `${(bytes / 1024 ** exponent).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
    })} ${units[exponent]}`;
}

function formatDuration(value) {
    const seconds = Number(value ?? 0);
    return seconds > 0 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min` : "—";
}

function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}
