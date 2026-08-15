import { createCategoryModule } from "../modules/categories/category-module.js";
import { createVideoModule } from "../modules/videos/video-module.js";
import { createAdminModule } from "../modules/admin/admin-module.js";
import { adminApi } from "../modules/admin/api/admin-api.js";
import {
    getErrorMessage,
    showNotification,
} from "../shared/ui/notification.js";

let videoModule;
let adminModule;

const categoryModule = createCategoryModule({
    onSelectionChange(selection) {
        void videoModule?.selectCategory(selection);
    },
    onCategoriesChange() {
        void videoModule?.refresh();
    },
});

try {
    const currentUser = await adminApi.me();
    document.body.dataset.role = currentUser.role;
    document.querySelector("#current-user").textContent =
        `${currentUser.name} • ${currentUser.role}`;
    await categoryModule.initialize();
    videoModule = createVideoModule({
        getCategories: categoryModule.getCategories,
        currentUser,
    });
    await videoModule.initialize();
    adminModule = createAdminModule({
        currentUser,
        onLibraryChanged: videoModule.refresh,
    });
    await adminModule.initialize();
} catch (error) {
    showNotification(getErrorMessage(error), "error");
}
