import type { OperationPublisher } from "@rostra/operations";
import { BullMqOperationPublisher, OPERATION_PRODUCER_OPTIONS } from "@rostra/operations";
import type { ConnectionOptions } from "bullmq";
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
	const connection = new Redis(url, {
		maxRetriesPerRequest: 1,
		enableOfflineQueue: false,
		connectTimeout: 1_000,
		commandTimeout: 2_000,
	});
	const publisher = new BullMqOperationPublisher({
		...connection.options,
		...OPERATION_PRODUCER_OPTIONS,
	} as ConnectionOptions);
	return {
		async publish(payload) {
			await publisher.publish(payload);
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
				await publisher.close();
			} finally {
				connection.disconnect();
			}
		},
	};
}
