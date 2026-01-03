export interface AdminListUsersRequestDTO {
    limit?: number;
    offset?: number;
    search?: string;
    filter?: 'banned' | 'admin' | 'recent';
    includeDeleted?: boolean;
}