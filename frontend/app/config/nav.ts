// Sidebar entries. Later phases append a group (or items) here; nothing else needs to change.
export interface NavItem {
  id: string;
  /** i18n key */
  labelKey: string;
  /** Bootstrap Icons name; must be listed in config/icons.json */
  icon: string;
  to: string;
  /** Shown only while that optional module is switched on in Settings. */
  requires?: 'fees';
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
    id: 'school',
    labelKey: 'nav.schoolGroup',
    items: [
      { id: 'students', labelKey: 'nav.students', icon: 'mortarboard', to: '/students' },
      { id: 'teachers', labelKey: 'nav.teachers', icon: 'person-badge', to: '/teachers' },
      { id: 'classes', labelKey: 'nav.classes', icon: 'grid-3x3-gap', to: '/classes' },
    ],
  },
  {
    id: 'studies',
    labelKey: 'nav.studiesGroup',
    items: [
      { id: 'attendance', labelKey: 'nav.attendance', icon: 'calendar-check', to: '/attendance' },
      { id: 'timetable', labelKey: 'nav.timetable', icon: 'calendar-week', to: '/timetable' },
      { id: 'exams', labelKey: 'nav.exams', icon: 'journal-text', to: '/exams' },
      { id: 'reportCards', labelKey: 'nav.reportCards', icon: 'file-earmark-text', to: '/report-cards' },
      { id: 'honorRoll', labelKey: 'nav.honorRoll', icon: 'award', to: '/honor-roll' },
      { id: 'monthlyRanking', labelKey: 'nav.monthlyRanking', icon: 'list-ol', to: '/monthly-ranking' },
      { id: 'homework', labelKey: 'nav.homework', icon: 'book', to: '/homework' },
      { id: 'fees', labelKey: 'nav.fees', icon: 'cash-coin', to: '/fees', requires: 'fees' },
      { id: 'reports', labelKey: 'nav.reports', icon: 'file-earmark-bar-graph', to: '/reports' },
    ],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    items: [
      { id: 'school', labelKey: 'nav.school', icon: 'building', to: '/settings/school' },
      { id: 'academic', labelKey: 'nav.academic', icon: 'calendar3', to: '/settings/academic' },
      { id: 'attendanceSessions', labelKey: 'nav.attendanceSessions', icon: 'clock', to: '/settings/attendance-sessions' },
      { id: 'timetableSettings', labelKey: 'nav.timetableSettings', icon: 'table', to: '/settings/timetable' },
      { id: 'grading', labelKey: 'nav.grading', icon: 'award', to: '/settings/grading' },
      { id: 'reportOptions', labelKey: 'nav.reportOptions', icon: 'printer', to: '/settings/reports' },
      { id: 'reportCardTemplate', labelKey: 'nav.reportCardTemplate', icon: 'file-earmark-text', to: '/settings/report-card' },
      { id: 'feeSettings', labelKey: 'nav.feeSettings', icon: 'cash-coin', to: '/settings/fees' },
      { id: 'preferences', labelKey: 'nav.preferences', icon: 'sliders', to: '/settings/preferences' },
      { id: 'backup', labelKey: 'nav.backup', icon: 'archive', to: '/settings/backup' },
      { id: 'security', labelKey: 'nav.security', icon: 'shield-lock', to: '/settings/security' },
      { id: 'audit', labelKey: 'nav.audit', icon: 'clock-history', to: '/settings/audit' },
      { id: 'performance', labelKey: 'nav.performance', icon: 'cpu', to: '/settings/performance' },
      { id: 'system', labelKey: 'nav.system', icon: 'heart-pulse', to: '/settings/system' },
      { id: 'about', labelKey: 'nav.about', icon: 'info-circle-fill', to: '/settings/about' },
    ],
  },
];
