import {
    jsonRequest,
    request,
} from "../../../shared/api/http-client.js";

export const adminApi = {
    me() {
        return request("/auth/me");
    },

    dashboard() {
        return request("/admin/dashboard");
    },

    users() {
        return request("/auth/users");
    },

    createUser(user) {
        return jsonRequest("/auth/users", "POST", user);
    },

    updateUser(id, changes) {
        return jsonRequest(
            `/auth/users/${encodeURIComponent(id)}`,
            "PATCH",
            changes,
        );
    },

    restore(formData) {
        return request("/admin/restore", {
            method: "POST",
            body: formData,
        });
    },
};
