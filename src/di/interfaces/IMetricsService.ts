export interface IMetricsService {
    /**
     * Increments a counter by name and optional labels.
     *
     * @param metric Name of the metric (e.g., 'password_reset.email')
     * @param labels Label key-value pairs
     */
    increment(metric: string, labels?: Record<string, string>): void;
}
