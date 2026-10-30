/** A to-do item on the dashboard's "set-up tasks" card. */
export interface SetupTask {
  id: string;
  /** i18n key of the task title */
  titleKey: string;
  /** i18n key of the explanation */
  hintKey: string;
  to: string;
  /** Bootstrap Icons name (config/icons.json) */
  icon: string;
}
