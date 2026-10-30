import { addCollection } from '@iconify/vue/dist/offline';
import bootstrapIcons from 'virtual:bootstrap-icons';

// Offline mode: the icons are registered from the bundled subset, so @iconify/vue never contacts api.iconify.design.
export default defineNuxtPlugin(() => {
  addCollection(bootstrapIcons);
});
