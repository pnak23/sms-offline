// Runtime options for vue-i18n. Messages live in ./locales/km.json (one file, namespaced).
export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'km',
  fallbackLocale: 'km',
  // Surface typos during development; production stays quiet.
  missingWarn: import.meta.dev,
  fallbackWarn: false,
}));
