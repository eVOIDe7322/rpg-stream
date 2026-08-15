import {
    jsonRequest,
    request,
} from "../../../shared/api/http-client.js";

export const videosApi = {
    list(categoryId = null) {
        const query =
            categoryId === null ? "" : `?cat=${encodeURIComponent(categoryId)}`;
        return request(`/videos${query}`);
    },

    details(id) {
        return request(`/videos/${encodeURIComponent(id)}`);
    },

    update(id, changes) {
        return jsonRequest(
            `/videos/${encodeURIComponent(id)}`,
            "PATCH",
            changes,
        );
    },

    updateThumbnail(id, timeSeconds) {
        return jsonRequest(
            `/videos/${encodeURIComponent(id)}/thumbnail`,
            "PATCH",
            { segundo: timeSeconds },
        );
    },

    pause(id) {
        return request(`/videos/${encodeURIComponent(id)}/pause`, {
            method: "POST",
        });
    },

    resume(id) {
        return request(`/videos/${encodeURIComponent(id)}/resume`, {
            method: "POST",
        });
    },

    cancel(id) {
        return request(`/videos/${encodeURIComponent(id)}/cancel`, {
            method: "POST",
        });
    },

    history(id) {
        return request(`/videos/${encodeURIComponent(id)}/history`);
    },

    markers(id) {
        return request(`/videos/${encodeURIComponent(id)}/markers`);
    },

    addMarker(id, marker) {
        return jsonRequest(
            `/videos/${encodeURIComponent(id)}/markers`,
            "POST",
            marker,
        );
    },

    deleteMarker(id, markerId) {
        return request(
            `/videos/${encodeURIComponent(id)}/markers/${encodeURIComponent(markerId)}`,
            { method: "DELETE" },
        );
    },

    trash() {
        return request("/videos/trash");
    },

    restore(id) {
        return request(`/videos/${encodeURIComponent(id)}/restore`, {
            method: "POST",
        });
    },

    purge(id) {
        return request(`/videos/${encodeURIComponent(id)}/purge`, {
            method: "DELETE",
        });
    },

    remove(id) {
        return request(`/videos/${encodeURIComponent(id)}`, {
            method: "DELETE",
        });
    },

    upload(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    onProgress(
                        Math.round((event.loaded / event.total) * 100),
                    );
                }
            });

            xhr.addEventListener("load", () => {
                const payload = parseResponse(xhr.responseText);

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(payload);
                    return;
                }

                reject(
                    new Error(
                        payload?.error ??
                            "O upload não pôde ser concluído.",
                    ),
                );
            });

            xhr.addEventListener("error", () => {
                reject(new Error("Não foi possível conectar ao servidor."));
            });

            xhr.open("POST", "/videos/upload");
            xhr.send(formData);
        });
    },
};

function parseResponse(responseText) {
    try {
        return JSON.parse(responseText);
    } catch {
        return null;
    }
}
