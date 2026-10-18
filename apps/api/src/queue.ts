import type { OperationPublisher, OperationQueuePayload } from "@rostra/operations";
import { type ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";

export interface OperationQueueTransport extends OperationPublisher {
	ready(): Promise<boolean>;
	close(): Promise<void>;
}

export function createOperationQueueTransport(url: string | undefined): OperationQueueTransport {
	if (!url) {
		return {
			async publish() {
				throw new Error("Operation delivery requires REDIS_URL");
			},
			async ready() {
				return false;
			},
			async close() {},
		};
	}
	const connection = new Redis(url, { maxRetriesPerRequest: null });
	const queue = new Queue<OperationQueuePayload>("operations", {
		connection: connection as unknown as ConnectionOptions,
	});
	return {
		async publish(payload) {
			await queue.add("operation", payload, {
				attempts: 5,
				backoff: { type: "exponential", delay: 1_000 },
				removeOnComplete: 1_000,
				removeOnFail: false,
			});
		},
		async ready() {
			try {
				return (await connection.ping()) === "PONG";
			} catch {
				return false;
			}
		},
		async close() {
			try {
				await queue.close();
			} finally {
				connection.disconnect();
			}
		},
	};
}
