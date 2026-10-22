/** Durable job registration shared by module declarations and worker dispatch. */
export interface JobDefinition {
	name: string;
	/** Optional cron expression for scheduled jobs. */
	cron?: string;
	handler(payload: unknown): void | PromiseLike<void>;
}
