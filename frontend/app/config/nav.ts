// Sidebar entries. Later phases append a group (or items) here; nothing else needs to change.
export interface NavItem {
  id: string;
  /** i18n key */
  labelKey: string;
  /** Bootstrap Icons name; must be listed in config/icons.json */
  icon: string;
  to: string;
}

export interface NavGroup {
  id: string;
  /** i18n key of the group heading (omitted for the first, unlabelled group) */
  labelKey?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    items: [{ id: 'dashboard', labelKey: 'nav.dashboard', icon: 'speedometer2', to: '/dashboard' }],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    items: [
      { id: 'school', labelKey: 'nav.school', icon: 'building', to: '/settings/school' },
      { id: 'academic', labelKey: 'nav.academic', icon: 'calendar3', to: '/settings/academic' },
      { id: 'security', labelKey: 'nav.security', icon: 'shield-lock', to: '/settings/security' },
      { id: 'system', labelKey: 'nav.system', icon: 'heart-pulse', to: '/settings/system' },
    ],
  },
];
