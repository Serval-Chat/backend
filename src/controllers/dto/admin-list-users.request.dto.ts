export interface ListUsersDTO {
    limit: number; // default 50
    offset: number; // default 0
    search?: string;
    filter?: 'banned' | 'admin' | 'recent';
    includeDeleted?: boolean;
}