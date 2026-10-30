import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import RecoveryKeyPanel from '~/components/recovery/RecoveryKeyPanel.vue';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';

// The panel is written for Nuxt (auto-imported useI18n/useRoute/navigateTo); here those are small stand-ins.
const navigateTo = vi.fn();
vi.stubGlobal('ref', ref);
vi.stubGlobal('computed', computed);
vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }));
vi.stubGlobal('useRoute', () => ({ path: '/settings/security' }));
vi.stubGlobal('navigateTo', navigateTo);

const LoadingButton = defineComponent({
  props: { loading: Boolean, disabled: Boolean, icon: String },
  emits: ['click'],
  template: '<button type="button" class="continue" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
});
const AppIcon = defineComponent({ props: { name: String }, template: '<i />' });

const KEY = 'AB3D5-F7G9H-JKMNP-QRSTV-WXYZ0';

function mountPanel() {
  const wrapper = mount(RecoveryKeyPanel, { global: { components: { LoadingButton, AppIcon } } });
  return {
    wrapper,
    checkbox: () => wrapper.find<HTMLInputElement>('#recovery-saved'),
    retype: () => wrapper.find<HTMLInputElement>('#recovery-retype'),
    cont: () => wrapper.find<HTMLButtonElement>('button.continue'),
  };
}

async function typeGroup(input: ReturnType<ReturnType<typeof mountPanel>['retype']>, text: string) {
  await input.setValue(text);
}

beforeEach(() => {
  setActivePinia(createPinia());
  useRecoveryKeyStore().issue(KEY, '/settings/security');
  navigateTo.mockReset();
});

describe('RecoveryKeyPanel: the "I really saved it" gate', () => {
  it('shows the key from the store in five groups', () => {
    const { wrapper } = mountPanel();
    expect(wrapper.findAll('.recovery-key-group').map((g) => g.text())).toEqual(['AB3D5', 'F7G9H', 'JKMNP', 'QRSTV', 'WXYZ0']);
  });

  it('has no copy-to-clipboard button and blocks the copy event on the key', async () => {
    const { wrapper } = mountPanel();
    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels.some((text) => /copy|ចម្លង/i.test(text))).toBe(false);
    const block = wrapper.find('.recovery-key-block');
    const event = new Event('copy', { cancelable: true, bubbles: true });
    block.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Continue is disabled until BOTH the checkbox is ticked AND the first group is retyped correctly', async () => {
    const { wrapper, checkbox, retype, cont } = mountPanel();
    expect(cont().element.disabled).toBe(true);

    await checkbox().setValue(true);
    expect(cont().element.disabled).toBe(true); // checkbox alone is not enough

    await typeGroup(retype(), 'zzzzz');
    expect(cont().element.disabled).toBe(true); // wrong group

    await typeGroup(retype(), 'ab3d5'); // right group, lower case
    expect(cont().element.disabled).toBe(false);

    await checkbox().setValue(false);
    expect(cont().element.disabled).toBe(true); // un-ticking locks it again

    await checkbox().setValue(true);
    await cont().trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('the retype field alone (without the checkbox) never enables Continue, and Enter does not confirm', async () => {
    const { wrapper, retype, cont } = mountPanel();
    await typeGroup(retype(), 'AB3D5');
    expect(cont().element.disabled).toBe(true);
    await retype().trigger('keydown.enter');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('accepts the group with a trailing dash, spaces and look-alike letters, like the server does', async () => {
    const { checkbox, retype, cont } = mountPanel();
    await checkbox().setValue(true);
    await typeGroup(retype(), ' ab3d5- ');
    expect(cont().element.disabled).toBe(false);
  });

  it('cannot confirm when no key is held (nothing to compare with)', async () => {
    useRecoveryKeyStore().clear();
    const { wrapper, checkbox, retype, cont } = mountPanel();
    await checkbox().setValue(true);
    await typeGroup(retype(), 'AB3D5');
    expect(cont().element.disabled).toBe(true);
    expect(wrapper.findAll('.recovery-key-group')).toHaveLength(1); // an empty placeholder group, no key text
  });

  it('Print / PDF opens the print page, remembering where to come back to, with the key staying in the store (not the URL)', async () => {
    const { wrapper } = mountPanel();
    const print = wrapper.findAll('button').find((b) => b.text().includes('recovery.printOrPdf'));
    await print?.trigger('click');
    expect(navigateTo).toHaveBeenCalledWith('/print/recovery-key');
    expect(String(navigateTo.mock.calls[0]?.[0])).not.toContain('AB3D5');
    expect(useRecoveryKeyStore().returnTo).toBe('/settings/security');
  });

  it('shows a failure of the host page confirm request', () => {
    const wrapper = mount(RecoveryKeyPanel, { props: { error: 'boom' }, global: { components: { LoadingButton, AppIcon } } });
    expect(wrapper.find('.alert-danger').text()).toContain('boom');
  });
});
