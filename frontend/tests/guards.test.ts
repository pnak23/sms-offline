import { describe, expect, it } from 'vitest';
import type { AuthStatus } from '~/types/api';
import { decideRoute, resumeStep, ROUTES } from '~/utils/guards';

const status = (overrides: Partial<AuthStatus> = {}): AuthStatus => ({
  setupRequired: false,
  authenticated: true,
  recoveryKeyPending: false,
  setupCompleted: true,
  ...overrides,
});

const decide = (s: AuthStatus, path: string, hasRecoveryKey = false) => decideRoute({ status: s, path, hasRecoveryKey });

describe('route guard: first launch', () => {
  const first = status({ setupRequired: true, authenticated: false, setupCompleted: false });

  it('allows only /setup while no administrator exists', () => {
    expect(decide(first, ROUTES.setup)).toBeNull();
    expect(decide(first, ROUTES.login)).toBe(ROUTES.setup);
    expect(decide(first, ROUTES.recover)).toBe(ROUTES.setup);
    expect(decide(first, ROUTES.dashboard)).toBe(ROUTES.setup);
    expect(decide(first, '/settings/school')).toBe(ROUTES.setup);
  });

  it('keeps the wizard reachable when the account was just created in this session', () => {
    expect(decide(status({ setupCompleted: false, recoveryKeyPending: true }), ROUTES.setup, true)).toBeNull();
  });
});

describe('route guard: signed out', () => {
  const out = status({ authenticated: false });

  it('allows the sign-in and recovery pages only', () => {
    expect(decide(out, ROUTES.login)).toBeNull();
    expect(decide(out, ROUTES.recover)).toBeNull();
    expect(decide(out, ROUTES.dashboard)).toBe(ROUTES.login);
    expect(decide(out, '/settings/system')).toBe(ROUTES.login);
    expect(decide(out, ROUTES.setup)).toBe(ROUTES.login);
    expect(decide(out, ROUTES.home)).toBe(ROUTES.login);
  });

  it('allows the key print page only while a key is held in memory (recovery flow)', () => {
    expect(decide(out, ROUTES.printRecoveryKey, true)).toBeNull();
    expect(decide(out, ROUTES.printRecoveryKey, false)).toBe(ROUTES.login);
  });
});

describe('route guard: unconfirmed recovery key', () => {
  const pending = status({ recoveryKeyPending: true });

  it('forces /security/recovery-key from every other page', () => {
    expect(decide(pending, ROUTES.dashboard)).toBe(ROUTES.forcedRecoveryKey);
    expect(decide(pending, '/settings/school')).toBe(ROUTES.forcedRecoveryKey);
    expect(decide(pending, ROUTES.forcedRecoveryKey)).toBeNull();
    expect(decide(pending, ROUTES.setup)).toBe(ROUTES.forcedRecoveryKey);
  });

  it('lets a freshly shown key be printed, and the page that shows it stay open', () => {
    expect(decide(pending, ROUTES.printRecoveryKey, true)).toBeNull();
    expect(decide(pending, ROUTES.settingsSecurity, true)).toBeNull();
    expect(decide(pending, ROUTES.printRecoveryKey, false)).toBe(ROUTES.forcedRecoveryKey);
  });

  it('wins over an unfinished wizard', () => {
    expect(decide(status({ recoveryKeyPending: true, setupCompleted: false }), ROUTES.setup)).toBe(ROUTES.forcedRecoveryKey);
  });
});

describe('route guard: unfinished wizard', () => {
  const unfinished = status({ setupCompleted: false });

  it('sends a signed-in user back into /setup', () => {
    expect(decide(unfinished, ROUTES.setup)).toBeNull();
    expect(decide(unfinished, ROUTES.dashboard)).toBe(ROUTES.setup);
    expect(decide(unfinished, ROUTES.home)).toBe(ROUTES.setup);
  });
});

describe('route guard: normal use', () => {
  it('allows ordinary pages and moves auth-only pages to the dashboard', () => {
    const ok = status();
    expect(decide(ok, ROUTES.dashboard)).toBeNull();
    expect(decide(ok, '/settings/system')).toBeNull();
    expect(decide(ok, ROUTES.login)).toBe(ROUTES.dashboard);
    expect(decide(ok, ROUTES.recover)).toBe(ROUTES.dashboard);
    expect(decide(ok, ROUTES.setup)).toBe(ROUTES.dashboard);
    expect(decide(ok, ROUTES.forcedRecoveryKey)).toBe(ROUTES.dashboard);
    expect(decide(ok, ROUTES.home)).toBe(ROUTES.dashboard);
    expect(decide(ok, ROUTES.printRecoveryKey, false)).toBe(ROUTES.dashboard);
  });
});

describe('wizard resume step', () => {
  it('never resumes earlier than step 4 and never past step 7', () => {
    expect(resumeStep(1)).toBe(4);
    expect(resumeStep(3)).toBe(4);
    expect(resumeStep(4)).toBe(4);
    expect(resumeStep(6)).toBe(6);
    expect(resumeStep(7)).toBe(7);
    expect(resumeStep(99)).toBe(7);
    expect(resumeStep(Number.NaN)).toBe(4);
  });
});
