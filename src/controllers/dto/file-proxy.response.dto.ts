export interface FileProxyMetaResponseDTO {
    status: number;
    headers: Record<string, string>;
    size?: number;
}
