import { createBootstrap } from 'bootstrap-vue-next/plugins/createBootstrap';

// bootstrap-vue-next 1.2.2 ships no Nuxt module, so it is installed as a plain Vue plugin. Components are imported
// where they are used (tree-shaken); <BApp> in app.vue hosts toasts and modals.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createBootstrap());
});
