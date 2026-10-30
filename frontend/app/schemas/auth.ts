import { z } from 'zod';
import { passwordIssues } from '../utils/password';
import { isCompleteRecoveryKey } from '../utils/recoveryKey';
import { usernameIssues } from '../utils/username';

// Error messages in these schemas are validation codes: the UI shows `validation.<CODE>` (see FormInput).

const required = (max?: number) => {
  const base = z.string().trim().min(1, 'REQUIRED');
  return max ? base.max(max, 'Size') : base;
};

/** Passwords are never trimmed or altered: what the user typed is what is checked and sent. */
const requiredPassword = z.string().min(1, 'REQUIRED');

function addIssues(ctx: z.RefinementCtx, path: string, codes: string[]): void {
  for (const code of codes) ctx.addIssue({ code: z.ZodIssueCode.custom, message: code, path: [path] });
}

export const loginSchema = z.object({
  username: required(100),
  password: requiredPassword,
});

/** Wizard step 2. Mirrors the server's username and password rules so most mistakes are caught before the request. */
export const adminSchema = z
  .object({
    displayName: required(100),
    username: required(100),
    password: requiredPassword,
    confirmPassword: requiredPassword,
  })
  .superRefine((value, ctx) => {
    addIssues(ctx, 'username', usernameIssues(value.username));
    addIssues(ctx, 'password', passwordIssues(value.password, value.username));
    if (value.password !== value.confirmPassword) addIssues(ctx, 'confirmPassword', ['PASSWORDS_DO_NOT_MATCH']);
  });

export const recoverSchema = z
  .object({
    recoveryKey: z.string().min(1, 'REQUIRED'),
    newPassword: requiredPassword,
    confirmPassword: requiredPassword,
  })
  .superRefine((value, ctx) => {
    if (!isCompleteRecoveryKey(value.recoveryKey)) addIssues(ctx, 'recoveryKey', ['RECOVERY_KEY_INCOMPLETE']);
    addIssues(ctx, 'newPassword', passwordIssues(value.newPassword));
    if (value.newPassword !== value.confirmPassword) addIssues(ctx, 'confirmPassword', ['PASSWORDS_DO_NOT_MATCH']);
  });

/** `getUsername` supplies the signed-in user's name for the "password equals username" rule. */
export function createChangePasswordSchema(getUsername: () => string | undefined) {
  return z
    .object({
      currentPassword: requiredPassword,
      newPassword: requiredPassword,
      confirmPassword: requiredPassword,
    })
    .superRefine((value, ctx) => {
      addIssues(ctx, 'newPassword', passwordIssues(value.newPassword, getUsername()));
      if (value.newPassword !== value.confirmPassword) addIssues(ctx, 'confirmPassword', ['PASSWORDS_DO_NOT_MATCH']);
    });
}

/** Unlock screen. */
export const unlockSchema = z.object({ password: requiredPassword });

/** "Confirm with your current password" (recovery-key regeneration). */
export const currentPasswordSchema = z.object({ currentPassword: requiredPassword });

export type LoginValues = z.infer<typeof loginSchema>;
export type AdminValues = z.infer<typeof adminSchema>;
export type RecoverValues = z.infer<typeof recoverSchema>;
export type ChangePasswordValues = z.infer<ReturnType<typeof createChangePasswordSchema>>;
