import type { AcceptanceItem, AcceptancePending } from '../types/api';

/**
 * The five states the school needs kept apart. Four are about the work; the fifth is a person's signature:
 * development completed · configuration pending · official information pending · physical testing pending · final school acceptance completed.
 */
export type AcceptanceState = 'FINAL_ACCEPTANCE_COMPLETED' | `${AcceptancePending}_PENDING`;

/** What an item is, for the school, right now: signed off by the administrator, or still pending for one reason. */
export function stateOf(item: Pick<AcceptanceItem, 'pending' | 'signOff'>): AcceptanceState {
  return item.signOff ? 'FINAL_ACCEPTANCE_COMPLETED' : `${item.pending}_PENDING`;
}

export interface AcceptanceSummary {
  total: number;
  /** items whose program side is built and tested (counted whether or not the school has accepted them) */
  developmentCompleted: number;
  configurationPending: number;
  officialInformationPending: number;
  physicalTestingPending: number;
  finalAccepted: number;
}

export function summarize(items: readonly AcceptanceItem[]): AcceptanceSummary {
  const s: AcceptanceSummary = { total: items.length, developmentCompleted: 0, configurationPending: 0, officialInformationPending: 0, physicalTestingPending: 0, finalAccepted: 0 };
  for (const item of items) {
    if (item.development === 'COMPLETED') s.developmentCompleted += 1;
    switch (stateOf(item)) {
      case 'FINAL_ACCEPTANCE_COMPLETED':
        s.finalAccepted += 1;
        break;
      case 'CONFIGURATION_PENDING':
        s.configurationPending += 1;
        break;
      case 'OFFICIAL_INFORMATION_PENDING':
        s.officialInformationPending += 1;
        break;
      case 'PHYSICAL_TESTING_PENDING':
        s.physicalTestingPending += 1;
        break;
    }
  }
  return s;
}

/** True once the administrator signed the item off. An unknown or not-yet-loaded list is "not signed": nothing is assumed accepted. */
export function isSignedOff(items: readonly AcceptanceItem[], id: string): boolean {
  return items.some((item) => item.id === id && item.signOff !== null);
}

/** Bootstrap contextual colour for the state badge. */
export function stateVariant(state: AcceptanceState): 'success' | 'warning' | 'info' | 'secondary' {
  switch (state) {
    case 'FINAL_ACCEPTANCE_COMPLETED':
      return 'success';
    case 'PHYSICAL_TESTING_PENDING':
      return 'secondary';
    case 'OFFICIAL_INFORMATION_PENDING':
      return 'warning';
    default:
      return 'info';
  }
}
