import { translate, type Vars } from "./core.ts";

/** Browser-safe translation entrypoint with an explicit or English locale. */
export function t(key: string, vars?: Vars, locale = "en"): string {
	return translate(key, vars, locale);
}
