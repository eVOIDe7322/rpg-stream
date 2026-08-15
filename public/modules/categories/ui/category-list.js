function createActionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-action ${className}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function createCategoryItem(category, options) {
    const item = document.createElement("div");
    item.className = "category-item";
    item.classList.toggle("category-item--active", options.isActive);

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "category-item__select";
    selectButton.textContent = category.nome;
    selectButton.addEventListener("click", () => options.onSelect(category));

    if (category.id === null) {
        item.append(selectButton);
        return item;
    }

    const actions = document.createElement("div");
    actions.className = "category-item__actions";
    actions.append(
        createActionButton("Editar", "category-action--edit", () =>
            options.onEdit(category),
        ),
        createActionButton("Excluir", "category-action--delete", () =>
            options.onDelete(category),
        ),
    );

    item.append(selectButton, actions);
    return item;
}

export function renderCategoryList(container, categories, options) {
    const allCategories = { id: null, nome: "Todas as categorias" };
    const items = [allCategories, ...categories].map((category) =>
        createCategoryItem(category, {
            ...options,
            isActive: options.activeId === category.id,
        }),
    );

    container.replaceChildren(...items);
}

export function renderCategoryOptions(select, categories) {
    const withoutCategory = new Option("Sem categoria", "");
    const options = categories.map(
        (category) => new Option(category.nome, String(category.id)),
    );

    select.replaceChildren(withoutCategory, ...options);
}
