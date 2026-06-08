import { registerLocale } from "@/i18n/index.ts";
import { publish, subscribe } from "@/services/bus.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * Live translation overlay. Build-time JSON (registered via `bundled.ts`) is the
 * baseline; `LocaleString` rows in the DB overlay/extend it and are loaded at
 * boot. Writes publish on the control bus so every shard re-applies the change
 * in-memory immediately - a new or fixed language needs no restart. English
 * stays the ultimate fallback for anything still missing.
 */

const log = getLogger("i18n:live");
const CHANNEL = "rostra:i18n";

interface ReloadMessage {
	locale?: string;
	namespace?: string;
	all?: boolean;
}

export interface LocaleRow {
	locale: string;
	namespace: string;
	key: string;
	value: string;
}

export interface GroupedBundle {
	locale: string;
	namespace: string;
	strings: Record<string, string>;
}

/** Group flat locale rows into per-(locale, namespace) string bundles (pure, tested). */
export function groupRows(rows: LocaleRow[]): GroupedBundle[] {
	const map = new Map<string, GroupedBundle>();
	for (const row of rows) {
		const k = `${row.locale}/${row.namespace}`;
		let entry = map.get(k);
		if (!entry) {
			entry = { locale: row.locale, namespace: row.namespace, strings: {} };
			map.set(k, entry);
		}
		entry.strings[row.key] = row.value;
	}
	return [...map.values()];
}

function applyRows(rows: LocaleRow[]): void {
	for (const bundle of groupRows(rows)) {
		registerLocale(bundle.locale, bundle.namespace, bundle.strings);
	}
}

/** Load every live translation row into the in-memory registry. Call at boot. */
export async function loadLiveLocales(): Promise<number> {
	const rows = await getPrisma()
		.localeString.findMany()
		.catch((err) => {
			log.error({ err }, "failed to load live locales");
			return [] as LocaleRow[];
		});
	applyRows(rows);
	if (rows.length) log.info({ count: rows.length }, "live translations loaded");
	return rows.length;
}

async function reloadSlice(locale?: string, namespace?: string): Promise<void> {
	const rows = await getPrisma()
		.localeString.findMany({
			where: { ...(locale ? { locale } : {}), ...(namespace ? { namespace } : {}) },
		})
		.catch(() => [] as LocaleRow[]);
	applyRows(rows);
}

/** Subscribe this shard to live-translation reload signals. Call at boot. */
export function subscribeLocaleReload(): void {
	subscribe(CHANNEL, (payload) => {
		const msg = (payload ?? {}) as ReloadMessage;
		if (msg.all) {
			void loadLiveLocales();
			return;
		}
		void reloadSlice(msg.locale, msg.namespace);
	});
}

/** Upsert one live string: persist, apply locally now, and fan out to other shards. */
export async function setLocaleString(
	locale: string,
	namespace: string,
	key: string,
	value: string,
): Promise<void> {
	await getPrisma().localeString.upsert({
		where: { locale_namespace_key: { locale, namespace, key } },
		create: { locale, namespace, key, value },
		update: { value },
	});
	registerLocale(locale, namespace, { [key]: value });
	await publish(CHANNEL, { locale, namespace } satisfies ReloadMessage);
}

/**
 * Bulk-load a whole namespace for a locale (used by `i18n:push` to promote file
 * translations into the live store). Persists, then fans out a single reload.
 */
export async function pushLocaleBundle(
	locale: string,
	namespace: string,
	strings: Record<string, string>,
): Promise<number> {
	const prisma = getPrisma();
	const entries = Object.entries(strings);
	await prisma.$transaction(
		entries.map(([key, value]) =>
			prisma.localeString.upsert({
				where: { locale_namespace_key: { locale, namespace, key } },
				create: { locale, namespace, key, value },
				update: { value },
			}),
		),
	);
	await publish(CHANNEL, { locale, namespace } satisfies ReloadMessage);
	return entries.length;
}
