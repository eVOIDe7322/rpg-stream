const notification = document.querySelector("#notification");
let hideTimer;

export function showNotification(message, type = "info") {
    window.clearTimeout(hideTimer);
    notification.textContent = message;
    notification.classList.toggle(
        "notification--error",
        type === "error",
    );
    notification.hidden = false;

    hideTimer = window.setTimeout(() => {
        notification.hidden = true;
    }, 4_000);
}

export function getErrorMessage(error) {
    return error instanceof Error
        ? error.message
        : "Ocorreu um erro inesperado.";
}
