# Translating Rostra

Rostra supports 16 languages and is built so adding or improving a translation needs only files, no code
changes. English is always the source of truth, and anything missing falls back to English automatically.

## Supported languages

English, French, German, Spanish, Portuguese (Brazil), Russian, Simplified Chinese, Italian, Dutch, Polish,
Turkish, Ukrainian, Japanese, Korean, Traditional Chinese, and Arabic.

## Where translations live

Translation files are JSON, one folder per language under `src/i18n/locales/<code>/`. Each file is a
namespace (for example `moderation.json`) that mirrors the English keys. The English source comes from each
module plus `common.json`.

## Workflow

1. See what is missing:

   ```
   npm run i18n:coverage
   ```

2. Edit or add `src/i18n/locales/<code>/<namespace>.json`. Keep every `{placeholder}` exactly as in English,
   and keep ICU syntax (plural and select forms, the `#`, and braces). Do not translate the brand and
   feature terms listed in `_glossary.json`.

3. Check your work:

   ```
   npm run i18n:validate
   ```

   This fails if any string does not compile or changes the placeholder set.

4. Rebuild and ship:

   ```
   npm run i18n:bundle    # regenerate the static bundle
   npm run i18n:push      # push to the live store; every shard reloads with no restart
   ```

## AI drafts

To fill many languages quickly, a maintainer can run `npm run i18n:draft`, which machine translates every
missing key as a draft for human review (it needs a translation provider configured). Drafts are validated
before they are written, and recorded for review. Reviewed drafts go live with `i18n:push`.

## Good to know

- The engine uses ICU MessageFormat, so plurals and number formatting are correct in every language.
- You never need to touch application code to add a language. Drop the files, validate, bundle, push.
