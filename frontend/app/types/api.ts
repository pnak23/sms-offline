// Shapes of the backend's JSON bodies (backend/src/main/java/kh/school/sms/**). The backend never sends user-facing text.

export interface FieldError {
  field: string;
  code: string;
}

/** Every non-2xx body. Some filter-level responses carry only `code`, so everything else is optional. */
export interface ProblemBody {
  status?: number;
  code?: string;
  fieldErrors?: FieldError[];
  retryAfterSeconds?: number;
  detail?: string;
}

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  recoveryKeyPending: boolean;
  setupCompleted: boolean;
}

export interface UserDto {
  username: string;
  displayName: string;
}

export interface SessionResponse {
  token: string | null;
  user: UserDto;
  recoveryKeyPending: boolean;
}

export interface SetupResponse {
  token: string;
  user: UserDto;
  recoveryKey: string;
}

export interface RecoverResponse {
  username: string;
  displayName: string;
  recoveryKey: string;
}

export interface KeyResponse {
  recoveryKey: string;
}

export interface SetupProgress {
  step: number;
  completed: boolean;
}

export interface SchoolProfile {
  nameKm: string | null;
  nameEn: string | null;
  address: string | null;
  phone: string | null;
  directorName: string | null;
  logoFile: string | null;
  version: number;
}

export interface SchoolProfileInput {
  nameKm: string;
  nameEn: string;
  address: string;
  phone: string;
  directorName: string;
  version: number;
}

/** GET/PUT /settings/app: every value is a string on the wire. */
export type AppSettings = Record<string, string>;

export interface Grade {
  id: number;
  level: number;
  nameKm: string;
}

export interface AcademicYear {
  id: number;
  nameKm: string;
  startDate: string;
  endDate: string;
  current: boolean;
  status: string;
  version: number;
}

export interface AcademicYearInput {
  nameKm: string;
  startDate: string;
  endDate: string;
  makeCurrent: boolean;
}

export interface Subject {
  id: number;
  code: string;
  nameKm: string;
  nameEn: string | null;
  active: boolean;
  version: number;
}

export type HealthStatus = 'OK' | 'WARN' | 'FAIL' | 'INFO';

export interface HealthCheck {
  id: string;
  status: HealthStatus;
  code: string;
  params: Record<string, string | number | boolean>;
  durationMs: number;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthCheck[];
  generatedAt: string;
}

export interface SystemInfo {
  appVersion: string;
  java: string;
  heapUsedMb: number;
  heapCommittedMb: number;
  heapMaxMb: number;
  startup: Record<string, number>;
}
