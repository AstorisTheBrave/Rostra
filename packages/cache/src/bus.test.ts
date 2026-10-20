import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type Redis from "ioredis";
import { createControlBus } from "./bus.ts";

class FakeRedis extends EventEmitter {
	status = "ready";
	readonly channels = new Set<string>();
	readonly receiver: FakeRedis;
	broken = false;
	subscribeCalls = 0;
	constructor(receiver?: FakeRedis) {
		super();
		this.receiver = receiver ?? this;
	}
	duplicate(): Redis {
		return this.receiver as unknown as Redis;
	}
	async subscribe(channel: string): Promise<number> {
		this.subscribeCalls++;
		this.channels.add(channel);
		return this.channels.size;
	}
	async unsubscribe(channel: string): Promise<number> {
		this.channels.delete(channel);
		return this.channels.size;
	}
	async publish(channel: string, message: string): Promise<number> {
		if (this.broken) throw new Error("redis unavailable");
		if (this.receiver.channels.has(channel)) this.receiver.emit("message", channel, message);
		return this.receiver.channels.has(channel) ? 1 : 0;
	}
	disconnect(): void {
		this.channels.clear();
	}
}

test("bus reports absent and failed publication", async () => {
	const local = createControlBus(() => undefined);
	assert.deepEqual(await local.publish("one", { n: 1 }), {
		status: "ttl-fallback",
		reason: "redis-absent",
	});
	local.close();
	const receiver = new FakeRedis();
	const publisher = new FakeRedis(receiver);
	const bus = createControlBus(() => publisher as unknown as Redis);
	publisher.broken = true;
	assert.deepEqual(await bus.publish("one", { n: 1 }), {
		status: "ttl-fallback",
		reason: "publish-failed",
	});
	bus.close();
});

test("dispose is idempotent and reconnect retains one handler", async () => {
	const receiver = new FakeRedis();
	const publisher = new FakeRedis(receiver);
	const bus = createControlBus(() => publisher as unknown as Redis);
	let calls = 0;
	const first = bus.subscribe("one", () => calls++);
	const second = bus.subscribe("one", () => calls++);
	await Promise.all([first.ready, second.ready]);
	assert.equal(receiver.subscribeCalls, 1);
	await bus.publish("one", { n: 1 });
	assert.equal(calls, 2);
	receiver.emit("reconnecting");
	receiver.emit("ready");
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.equal(receiver.subscribeCalls, 2);
	await bus.publish("one", { n: 2 });
	assert.equal(calls, 4);
	first.dispose();
	first.dispose();
	await bus.publish("one", { n: 3 });
	assert.equal(calls, 5);
	second.dispose();
	await bus.publish("one", { n: 4 });
	assert.equal(calls, 5);
	bus.close();
});

test("disposing during subscribe does not leave an orphaned channel", async () => {
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	class SlowRedis extends FakeRedis {
		override async subscribe(channel: string): Promise<number> {
			await gate;
			return super.subscribe(channel);
		}
	}
	const receiver = new SlowRedis();
	const publisher = new FakeRedis(receiver);
	const bus = createControlBus(() => publisher as unknown as Redis);
	const subscription = bus.subscribe("one", () => {});
	subscription.dispose();
	release?.();
	await subscription.ready;
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.equal(receiver.channels.has("one"), false);
	bus.close();
});
