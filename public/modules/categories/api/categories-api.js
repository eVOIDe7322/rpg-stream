import {
    jsonRequest,
    request,
} from "../../../shared/api/http-client.js";

export const categoriesApi = {
    list() {
        return request("/categorias");
    },

    create(name) {
        return jsonRequest("/categorias", "POST", { nome: name });
    },

    rename(id, name) {
        return jsonRequest(`/categorias/${id}`, "PATCH", {
            nome: name,
        });
    },

    remove(id) {
        return request(`/categorias/${id}`, { method: "DELETE" });
    },
};
