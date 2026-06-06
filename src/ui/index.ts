/**
 * Rostra UI library - the single import for all bot UI.
 *
 * Layout primitives (`container`, `text`, `section`, `gallery`, `divider`, `Accent`, `reply`,
 * `buildResponse`) come from the Components-V2 kit; interactive primitives (`button`, `actionRow`,
 * `buttonGrid`, `stringSelect`, `modal`, `textInput`) and higher-level patterns (`confirmRow`,
 * `settingsPanel`, `toggleButton`, `paginatorRow`) are defined here.
 *
 * Behaviour is wired by each module's ComponentHandler using the customId convention
 * `module:action:arg` - the library provides the components, the module provides the "onClick".
 */
export * from "@/utils/components.ts";
export * from "./interactive.ts";
export * from "./patterns.ts";
