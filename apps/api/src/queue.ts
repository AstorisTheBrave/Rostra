import type { OperationPublisher } from "@rostra/operations";
import { BullMqOperationPublisher } from "@rostra/operations";
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
	const connection = new Redis(url, { maxRetriesPerRequest: null });
	const publisher = new BullMqOperationPublisher(connection as unknown as ConnectionOptions);
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
