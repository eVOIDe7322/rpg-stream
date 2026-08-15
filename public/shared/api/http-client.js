export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

export async function request(url, options = {}) {
    let response;

    try {
        response = await fetch(url, options);
    } catch {
        throw new ApiError("Não foi possível conectar ao servidor.", 0);
    }

    const isJson = response.headers
        .get("content-type")
        ?.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
        const message =
            typeof payload === "object" && payload?.error
                ? payload.error
                : "A operação não pôde ser concluída.";
        throw new ApiError(message, response.status);
    }

    return payload;
}

export function jsonRequest(url, method, body) {
    return request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}
