import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Offline icons: a virtual module that contains ONLY the Bootstrap Icons listed in app/config/icons.json
 * (the full collection is 1 MB of JSON). Nothing is ever requested from api.iconify.design.
 */
function bootstrapIconSubset(): Plugin {
  const virtualId = 'virtual:bootstrap-icons';
  const resolved = `\0${virtualId}`;
  const listFile = fileURLToPath(new URL('./app/config/icons.json', import.meta.url));
  const collectionFile = fileURLToPath(new URL('../node_modules/@iconify-json/bi/icons.json', import.meta.url));
  return {
    name: 'sms:bootstrap-icon-subset',
    resolveId: (id) => (id === virtualId ? resolved : undefined),
    load(id) {
      if (id !== resolved) return undefined;
      this.addWatchFile(listFile);
      const wanted: string[] = JSON.parse(readFileSync(listFile, 'utf8'));
      const collection = JSON.parse(readFileSync(collectionFile, 'utf8')) as {
        prefix: string;
        width?: number;
        height?: number;
        icons: Record<string, unknown>;
      };
      const icons: Record<string, unknown> = {};
      for (const name of wanted) {
        if (!(name in collection.icons)) this.error(`Icon "${name}" (app/config/icons.json) is not in the bi collection`);
        icons[name] = collection.icons[name];
      }
      const subset = { prefix: collection.prefix, width: collection.width, height: collection.height, icons };
      return `export default ${JSON.stringify(subset)};`;
    },
  };
}

export default defineNuxtConfig({
  compatibilityDate: '2026-10-30',
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  devServer: { host: 'localhost', port: 3000 },

  // The app is loaded from app://school/ inside Electron: absolute asset paths + history-mode routing.
  app: {
    baseURL: '/',
    buildAssetsDir: '/_nuxt/',
    head: {
      htmlAttrs: { lang: 'km' },
      title: 'ប្រព័ន្ធគ្រប់គ្រងសាលាបឋមសិក្សា',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light' },
      ],
    },
  },
  router: { options: { hashMode: false } },

  modules: ['@pinia/nuxt', '@nuxtjs/i18n'],

  css: [
    '@fontsource/noto-sans-khmer/khmer-400.css',
    '@fontsource/noto-sans-khmer/khmer-500.css',
    '@fontsource/noto-sans-khmer/khmer-600.css',
    '@fontsource/noto-sans-khmer/khmer-700.css',
    '@fontsource/noto-sans-khmer/latin-400.css',
    '@fontsource/noto-sans-khmer/latin-500.css',
    '@fontsource/noto-sans-khmer/latin-600.css',
    '@fontsource/noto-sans-khmer/latin-700.css',
    '@fontsource/moul/khmer-400.css',
    '@fontsource/moul/latin-400.css',
    'bootstrap/dist/css/bootstrap.min.css',
    'bootstrap-vue-next/dist/bootstrap-vue-next.css',
    '~/assets/css/theme.css',
    '~/assets/css/layout.css',
    '~/assets/css/components.css',
    '~/assets/css/print.css',
  ],

  i18n: {
    defaultLocale: 'km',
    strategy: 'no_prefix',
    // Add `{ code: 'en', language: 'en', name: 'English', file: 'en.json' }` here (and i18n/locales/en.json) later.
    locales: [{ code: 'km', language: 'km-KH', name: 'ភាសាខ្មែរ', file: 'km.json' }],
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
  },

  // Components are used by file name (<FormInput>, not <UiFormInput>); file names must therefore stay unique.
  components: [{ path: '~/components', pathPrefix: false }],

  typescript: { strict: true, typeCheck: false },

  // A fixed build id keeps the one inline <script> in index.html byte-identical between builds, so the desktop shell can
  // allow it in its Content-Security-Policy by hash (see scripts/inline-script-hashes.mjs).
  buildId: 'sms-offline',

  experimental: {
    // An inline <script type="importmap"> would need a CSP exception in Electron; the entry is referenced directly instead.
    entryImportMap: false,
    // No runtime fetch of /_nuxt/builds/*.json: this app is a fixed local bundle, not a site that is redeployed under the user.
    appManifest: false,
  },

  nitro: { prerender: { crawlLinks: false, failOnError: true } },

  vite: {
    plugins: [bootstrapIconSubset()],
    build: { sourcemap: false },
    // Dev only: pre-bundle everything the first screens import lazily, so Vite does not re-optimise (and reload the page,
    // dropping the in-memory session) the first time the dashboard layout is opened.
    optimizeDeps: {
      include: [
        'bootstrap-vue-next/components/BApp',
        'bootstrap-vue-next/components/BButton',
        'bootstrap-vue-next/components/BSpinner',
        'bootstrap-vue-next/components/BModal',
        'bootstrap-vue-next/components/BDropdown',
        'bootstrap-vue-next/composables/useToast',
        'bootstrap-vue-next/plugins/createBootstrap',
        'vee-validate',
        '@vee-validate/zod',
        'zod',
        'dayjs',
        'dayjs/locale/km',
        '@iconify/vue/dist/offline',
      ],
    },
  },
});
