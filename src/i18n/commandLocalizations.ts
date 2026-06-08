import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import { SUPPORTED_LOCALES } from "./locales.ts";

/**
 * Native Discord command-metadata localization. Discord can show localized
 * command descriptions (and names) in each user's client, registered at deploy
 * time - separate from runtime response localization. This maps our locale codes
 * to translated descriptions per command name; `applyCommandLocalizations` merges
 * them into the command payload using each locale's Discord code.
 *
 * Only a seed set is translated here; the rest is content for the translation
 * waves (Crowdin/AI drafts). Adding a language or command = data only, no code.
 */
const DESCRIPTIONS: Record<string, Record<string, string>> = {
	fr: {
		help: "Parcourir les commandes par catégorie",
		preferences: "Vos paramètres personnels Rostra (langue et fonctionnalités)",
	},
	de: {
		help: "Befehle nach Kategorie durchsuchen",
		preferences: "Deine persönlichen Rostra-Einstellungen (Sprache und Funktionen)",
	},
	es: {
		help: "Explora los comandos por categoría",
		preferences: "Tus ajustes personales de Rostra (idioma y funciones)",
	},
	"pt-BR": {
		help: "Navegue pelos comandos por categoria",
		preferences: "Suas configurações pessoais do Rostra (idioma e recursos)",
	},
	ru: {
		help: "Просмотр команд по категориям",
		preferences: "Ваши личные настройки Rostra (язык и функции)",
	},
	"zh-CN": {
		help: "按类别浏览命令",
		preferences: "你的 Rostra 个人设置（语言和功能）",
	},
};

/** Merge native description localizations into the command registration payload. */
export function applyCommandLocalizations(
	body: RESTPostAPIApplicationCommandsJSONBody[],
): RESTPostAPIApplicationCommandsJSONBody[] {
	for (const command of body) {
		const descriptions: Record<string, string> = {};
		for (const meta of Object.values(SUPPORTED_LOCALES)) {
			if (!meta.discord) continue;
			const translated = DESCRIPTIONS[meta.code]?.[command.name];
			if (translated) descriptions[meta.discord] = translated;
		}
		if (Object.keys(descriptions).length > 0) {
			command.description_localizations = {
				...(command.description_localizations ?? {}),
				...descriptions,
			};
		}
	}
	return body;
}
