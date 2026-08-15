import { categoriesApi } from "./api/categories-api.js";
import {
    renderCategoryList,
    renderCategoryOptions,
} from "./ui/category-list.js";
import {
    getErrorMessage,
    showNotification,
} from "../../shared/ui/notification.js";

export function createCategoryModule({
    onSelectionChange,
    onCategoriesChange,
}) {
    const categoryList = document.querySelector("#category-list");
    const categoryForm = document.querySelector("#category-form");
    const categoryNameInput = document.querySelector("#new-category-name");
    const uploadCategory = document.querySelector("#upload-category");

    const state = {
        categories: [],
        activeId: null,
    };

    function render() {
        renderCategoryList(categoryList, state.categories, {
            activeId: state.activeId,
            onSelect: selectCategory,
            onEdit: editCategory,
            onDelete: deleteCategory,
        });
        renderCategoryOptions(uploadCategory, state.categories);
    }

    async function load() {
        state.categories = await categoriesApi.list();

        if (
            state.activeId !== null &&
            !state.categories.some(({ id }) => id === state.activeId)
        ) {
            state.activeId = null;
            onSelectionChange({
                id: null,
                name: "Todos os vídeos",
            });
        }

        render();
    }

    function selectCategory(category) {
        state.activeId = category.id;
        render();
        onSelectionChange({
            id: category.id,
            name:
                category.id === null
                    ? "Todos os vídeos"
                    : category.nome,
        });
    }

    async function editCategory(category) {
        const name = window.prompt(
            "Digite o novo nome para a categoria:",
            category.nome,
        );

        if (!name || name.trim() === category.nome) {
            return;
        }

        try {
            await categoriesApi.rename(category.id, name);
            await load();
            onCategoriesChange();
            showNotification("Categoria renomeada.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    async function deleteCategory(category) {
        const confirmed = window.confirm(
            "Mover os vídeos para “Sem categoria” e excluir?",
        );

        if (!confirmed) {
            return;
        }

        try {
            await categoriesApi.remove(category.id);
            await load();
            onCategoriesChange();
            showNotification("Categoria excluída.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        }
    }

    async function createCategory(event) {
        event.preventDefault();
        const name = categoryNameInput.value.trim();

        if (!name) {
            return;
        }

        const submitButton = categoryForm.querySelector(
            'button[type="submit"]',
        );
        submitButton.disabled = true;

        try {
            await categoriesApi.create(name);
            categoryNameInput.value = "";
            await load();
            showNotification("Categoria criada.");
        } catch (error) {
            showNotification(getErrorMessage(error), "error");
        } finally {
            submitButton.disabled = false;
        }
    }

    return {
        async initialize() {
            categoryForm.addEventListener("submit", createCategory);
            await load();
        },

        getCategories() {
            return [...state.categories];
        },
    };
}
