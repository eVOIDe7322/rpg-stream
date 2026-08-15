import { Category } from './category.js';

export interface CategoryRepository {
    add(category: Category): Promise<Category>;
    findAll(): Promise<Category[]>;
    findById(id: number): Promise<Category | null>;
    save(category: Category): Promise<void>;
    deleteAndUnassignVideos(id: number): Promise<boolean>;
}
