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
  /** The subjects this grade studies (grade_subjects). */
  subjectIds: number[];
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

export interface AcademicYearUpdateInput {
  nameKm: string;
  startDate: string;
  endDate: string;
  version: number;
}

export interface SubjectInput {
  nameKm: string;
  nameEn: string;
  /** The main subject this one is a sub-subject of; omitted (or null) for a main subject. Not changeable afterwards. */
  parentId?: number | null;
}

export interface Subject {
  id: number;
  code: string;
  nameKm: string;
  nameEn: string | null;
  /** null = a main subject; otherwise the main subject this sub-subject belongs to (two levels only). */
  parentId: number | null;
  active: boolean;
  version: number;
  /** An examination, a class's teachers or homework refer to it: it can be switched off but not removed. */
  inUse: boolean;
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
  product?: ProductInfo;
  springBoot?: string;
  sqlite?: string;
  /** The highest database migration applied (not the program's version). */
  schemaVersion?: number;
  os?: string;
}

// ---- Phase 2: teachers, classes, students, enrollments ------------------------------------------------------------

export type Gender = 'MALE' | 'FEMALE';
export type Relationship = 'FATHER' | 'MOTHER' | 'GRANDPARENT' | 'SIBLING' | 'UNCLE_AUNT' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED';
export type EnrollmentStatus = 'ACTIVE' | 'PROMOTED' | 'REPEATED' | 'GRADUATED' | 'CHANGED_CLASS' | 'LEFT';
export type PromotionOutcome = 'PROMOTED' | 'REPEATED' | 'GRADUATED';

export interface Teacher {
  id: number;
  teacherCode: string;
  nameKm: string;
  gender: Gender;
  phone: string | null;
  address: string | null;
  specialization: string | null;
  employmentDate: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}

/** What the teacher form edits; empty text means "nothing" (the server stores null). */
export interface TeacherInput {
  nameKm: string;
  gender: Gender;
  phone: string;
  address: string;
  specialization: string;
  employmentDate: string | null;
}

export interface TeacherAssignment {
  classId: number;
  className: string;
  gradeName: string;
  yearName: string;
  subjectId: number;
  subjectName: string;
}

export interface TeacherClasses {
  homeroomClasses: ClassDto[];
  assignments: TeacherAssignment[];
}

export interface ClassDto {
  id: number;
  academicYearId: number;
  yearName: string;
  gradeId: number;
  gradeLevel: number;
  gradeName: string;
  nameKm: string;
  capacity: number;
  homeroomTeacherId: number | null;
  homeroomTeacherName: string | null;
  /** MORNING / AFTERNOON; unused (always null) until the school says it runs shifts. */
  shift: string | null;
  studentCount: number;
  version: number;
}

export interface ClassAssignment {
  subjectId: number;
  subjectName: string;
  teacherId: number;
  teacherName: string;
}

export interface ClassDetail {
  schoolClass: ClassDto;
  assignments: ClassAssignment[];
}

export interface ClassInput {
  academicYearId: number;
  gradeId: number;
  nameKm: string;
  capacity: number | null;
  homeroomTeacherId: number | null;
}

/** One line of the student list: the student plus the class of the chosen academic year (null = not enrolled there). */
export interface StudentRow {
  id: number;
  studentCode: string;
  nameKm: string;
  nameEn: string | null;
  gender: Gender;
  dateOfBirth: string;
  status: StudentStatus;
  photoFile: string | null;
  enrollmentId: number | null;
  classId: number | null;
  className: string | null;
  gradeId: number | null;
  gradeName: string | null;
  gradeLevel: number | null;
  yearId: number | null;
  yearName: string | null;
}

export interface Student {
  id: number;
  studentCode: string;
  nameKm: string;
  nameEn: string | null;
  gender: Gender;
  dateOfBirth: string;
  placeOfBirth: string | null;
  address: string | null;
  village: string | null;
  commune: string | null;
  district: string | null;
  province: string | null;
  enrollmentDate: string;
  status: StudentStatus;
  photoFile: string | null;
  notes: string | null;
  version: number;
}

export interface Guardian {
  id: number;
  nameKm: string;
  relationship: Relationship;
  phone: string | null;
  primary: boolean;
}

export interface GuardianInput {
  nameKm: string;
  relationship: Relationship;
  phone: string;
  primary: boolean;
}

export interface EnrollmentHistory {
  enrollmentId: number;
  academicYearId: number;
  yearName: string;
  classId: number;
  className: string;
  gradeId: number;
  gradeName: string;
  status: EnrollmentStatus;
  enrolledOn: string;
  leftOn: string | null;
  endReason: string | null;
  version: number;
}

export interface StudentDetail {
  student: Student;
  guardians: Guardian[];
  enrollments: EnrollmentHistory[];
  /** From the save that produced this answer, e.g. CLASS_OVER_CAPACITY. */
  warnings: string[];
}

export interface StudentInput {
  nameKm: string;
  nameEn: string;
  gender: Gender;
  dateOfBirth: string;
  placeOfBirth: string;
  address: string;
  village: string;
  commune: string;
  district: string;
  province: string;
  enrollmentDate: string | null;
  notes: string;
  guardians: GuardianInput[];
  allowDuplicate: boolean;
}

export interface StudentFilters {
  q?: string;
  gender?: string;
  status?: string;
  yearId?: number | null;
  gradeId?: number | null;
  classId?: number | null;
  unenrolled?: boolean;
}

export interface Enrollment {
  id: number;
  studentId: number;
  academicYearId: number;
  classId: number;
  status: EnrollmentStatus;
  enrolledOn: string;
  leftOn: string | null;
  endReason: string | null;
  version: number;
}

export interface EnrollmentResult {
  enrollment: Enrollment;
  warnings: string[];
}

export interface RosterRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  nameEn: string | null;
  gender: Gender;
  dateOfBirth: string;
  photoFile: string | null;
  studentStatus: StudentStatus;
  status: EnrollmentStatus;
  enrolledOn: string;
}

export interface PromotionDecision {
  enrollmentId: number;
  outcome: PromotionOutcome;
  toClassId: number | null;
}

export interface PromotionClassLoad {
  classId: number;
  className: string;
  gradeName: string;
  current: number;
  adding: number;
  capacity: number;
}

export interface PromotionSummary {
  dryRun: boolean;
  promoted: number;
  repeated: number;
  graduated: number;
  classes: PromotionClassLoad[];
}

// ---- Phase 3: attendance, examinations, grading, report cards, homework -------------------------------------------

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';

/** How attendance is counted: DAY (each date once; a student with two sessions is one day) or SESSION (every sheet counts). The school's official choice is a setting. */
export type AttendanceBasis = 'DAY' | 'SESSION';

/** A day's status for one student, worked out from their records of that date (PARTIAL: attended one session and missed another). */
export type DayStatusCode = 'PRESENT' | 'LATE' | 'PARTIAL' | 'ABSENT' | 'LEAVE';

/** How many DAYS fell in each day status; `total` is the days recorded. A partial day is never added to present or absent. */
export interface DayTotals {
  present: number;
  late: number;
  partial: number;
  absent: number;
  leave: number;
  total: number;
}

/** One student of the class on the chosen day; `status` is null until it has been recorded. */
export interface AttendanceRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  status: AttendanceStatus | null;
  remark: string | null;
}

/** The session of the day a sheet belongs to: the name and times it was saved with (the live ones while it has not been saved), and whether new sheets can still start on it. */
export interface AttendancePeriodRef {
  id: number;
  nameKm: string;
  startTime: string | null;
  endTime: string | null;
  enabled: boolean;
}

/** One session of the school day ("វគ្គវត្តមាន"), kept per academic year by the administrator. The times are information only. */
export interface AttendancePeriod {
  id: number;
  academicYearId: number;
  nameKm: string;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  enabled: boolean;
  /** null until the administrator confirms that this name and these times are what the school really uses. */
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** How many class sheets have been taken in it (a session with sheets cannot be deleted, only switched off). */
  sheets: number;
  version: number;
}

export interface AttendanceSheet {
  classId: number;
  date: string;
  period: AttendancePeriodRef;
  /** null while nothing has been saved for this class, day and session. */
  sessionId: number | null;
  note: string | null;
  rows: AttendanceRow[];
  /** The sessions this class already has a sheet for on this day. */
  recordedPeriodIds: number[];
}

export interface AttendanceEntry {
  enrollmentId: number;
  status: AttendanceStatus;
  remark: string | null;
}

export interface AttendanceSession {
  sessionId: number;
  date: string;
  periodId: number;
  /** The name the sheet was saved with. */
  periodNameKm: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
}

export interface AttendanceSummaryRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  /** Sessions (sheets) recorded. */
  total: number;
  /** The same records counted as days. */
  days: DayTotals;
}

/** One date of a class: the students in each day status, and how many sheets were taken that day. */
export interface AttendanceDay {
  date: string;
  sheets: number;
  students: number;
  present: number;
  late: number;
  partial: number;
  absent: number;
  leave: number;
}

export interface AttendanceHistoryRow {
  date: string;
  periodNameKm: string;
  className: string;
  status: AttendanceStatus;
  remark: string | null;
}

export interface StudentAttendance {
  rows: AttendanceHistoryRow[];
  present: number;
  absent: number;
  late: number;
  leave: number;
  /** Sessions recorded. */
  total: number;
  days: DayTotals;
}

export type ExamKind = 'MONTHLY' | 'MIDTERM' | 'FINAL' | 'OTHER';

export interface Examination {
  id: number;
  academicYearId: number;
  yearName: string;
  nameKm: string;
  kind: ExamKind;
  termNo: number | null;
  startDate: string | null;
  endDate: string | null;
  version: number;
  /** Scores entered so far; an examination with scores cannot be deleted. */
  scoreCount: number;
  /** The first score was entered: the subject structure (which subjects and sub-subjects it has) can no longer change; a maximum or weight can still be corrected. */
  frozen: boolean;
}

export interface ExaminationInput {
  nameKm: string;
  kind: ExamKind;
  termNo: number | null;
  startDate: string | null;
  endDate: string | null;
}

/** One subject of one grade in an examination, with its maximum score and weight. */
/** A sub-subject row of an examination (its own score is typed; the main subject is the sum of them). */
export interface ExamSubSubject {
  id: number;
  subjectId: number;
  /** The name the examination was set up with. */
  subjectName: string;
  maxScore: number;
  scoreCount: number;
}

/** A MAIN subject of an examination and grade. SUB_SUBJECTS: its maximum is the sum of its sub-subjects and its score is their sum (read-only). */
export interface ExamSubject {
  id: number;
  gradeId: number;
  gradeLevel: number;
  subjectId: number;
  subjectName: string;
  maxScore: number;
  weight: number;
  scoreCount: number;
  scoreSource: 'DIRECT' | 'SUB_SUBJECTS';
  subSubjects: ExamSubSubject[];
}

export interface ScoreRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  /** null = nothing entered (not the same as 0). */
  score: number | null;
  absent: boolean;
  remark: string | null;
}

export interface ScoreSheet {
  examinationId: number;
  classId: number;
  subjectId: number;
  examSubjectId: number;
  maxScore: number;
  rows: ScoreRow[];
  /** The sheet is a sub-subject's (examSubjectId is then the sub-subject row). */
  subSubject: boolean;
}

export interface ScoreEntry {
  enrollmentId: number;
  score: number | null;
  absent: boolean;
  remark: string | null;
}

export interface GradingBand {
  minPercent: number;
  labelKm: string;
  letter: string;
}

export interface GradingScale {
  id: number;
  nameKm: string;
  isDefault: boolean;
  passPercent: number;
  version: number;
  /** Highest minimum first. */
  bands: GradingBand[];
}

export interface GradingScaleInput {
  nameKm: string;
  passPercent: number;
  bands: GradingBand[];
}

/** A sub-subject under a main subject of the results. */
export interface ResultSubSubject {
  examSubSubjectId: number;
  subjectId: number;
  subjectName: string;
  maxScore: number;
}
export interface ResultSubject {
  examSubjectId: number;
  subjectId: number;
  subjectName: string;
  maxScore: number;
  weight: number;
  scoreSource: 'DIRECT' | 'SUB_SUBJECTS';
  subSubjects: ResultSubSubject[];
}

export interface SubjectScore {
  examSubjectId: number;
  score: number | null;
  absent: boolean;
}

/** A pupil's score in one sub-subject row: the detail under a main subject. */
export interface SubSubjectScore {
  examSubSubjectId: number;
  score: number | null;
  absent: boolean;
}

/** percent, band, passed and rank are null while the result is incomplete (some subject has nothing entered). */
export interface StudentResult {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  scores: SubjectScore[];
  total: number;
  totalMax: number;
  percent: number | null;
  bandLetter: string | null;
  bandLabel: string | null;
  passed: boolean | null;
  rank: number | null;
  complete: boolean;
  absentCount: number;
  subScores: SubSubjectScore[];
}

export interface ExamResults {
  examinationId: number;
  classId: number;
  passPercent: number;
  /** The grading scale this examination is graded with (frozen when its first score was entered). */
  scaleName: string;
  subjects: ResultSubject[];
  students: StudentResult[];
}

export interface StudentExamResult {
  examinationId: number;
  examinationName: string;
  kind: ExamKind;
  termNo: number | null;
  yearName: string;
  classId: number;
  className: string;
  gradeName: string;
  result: StudentResult;
}

/** The detail under a main subject made of sub-subjects (empty for any other). */
export interface CardSubSubject {
  subjectName: string;
  maxScore: number;
  score: number | null;
  absent: boolean;
}
export interface CardSubject {
  examSubjectId: number;
  subjectName: string;
  maxScore: number;
  weight: number;
  score: number | null;
  absent: boolean;
  subSubjects: CardSubSubject[];
}

/** The card's attendance counted the school's official way: `basis` says whether the numbers are days or sessions (partial is 0 for sessions). */
export interface CardAttendance {
  basis: AttendanceBasis;
  present: number;
  late: number;
  partial: number;
  absent: number;
  leave: number;
  total: number;
  from: string;
  to: string;
}

export interface ReportCard {
  examinationId: number;
  examinationName: string;
  kind: ExamKind;
  termNo: number | null;
  yearName: string;
  classId: number;
  className: string;
  gradeName: string;
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  nameEn: string | null;
  gender: Gender;
  dateOfBirth: string;
  /** The stored photo's file name (fetch it with the session token), or null; shown only when the card's photo block is on. */
  photoFile: string | null;
  subjects: CardSubject[];
  total: number;
  totalMax: number;
  percent: number | null;
  bandLetter: string | null;
  bandLabel: string | null;
  passed: boolean | null;
  rank: number | null;
  /** How many students of the class have a rank (a complete result). */
  rankedCount: number;
  complete: boolean;
  attendance: CardAttendance;
  comment: string | null;
}

export type HomeworkStatus = 'ASSIGNED' | 'DONE' | 'CANCELLED';

/** What a student did with one assignment (the teacher chooses). No status at all means "not recorded yet". */
export type HomeworkRecordStatus = 'SUBMITTED' | 'LATE' | 'NOT_SUBMITTED' | 'EXCUSED';

/**
 * `subjectId` is the main subject or the sub-subject the homework is about (for a sub-subject `parentSubjectName` is its main subject). `maxScore` null = a homework
 * without marks. The counts say how the students of the class stand (a student with no record is in none of them); `scoreSum` is the sum of the marks entered.
 * Homework marks are NEVER part of an examination.
 */
export interface Homework {
  id: number;
  classId: number;
  className: string;
  gradeName: string;
  subjectId: number;
  subjectName: string;
  parentSubjectId: number | null;
  parentSubjectName: string | null;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  status: HomeworkStatus;
  remark: string | null;
  version: number;
  maxScore: number | null;
  studentCount: number;
  submittedCount: number;
  lateCount: number;
  notSubmittedCount: number;
  excusedCount: number;
  markedCount: number;
  scoreSum: number;
}

export interface HomeworkInput {
  classId: number;
  subjectId: number;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  remark: string | null;
  /** null = a homework without marks. */
  maxScore: number | null;
}

export interface HomeworkFilters {
  classId?: number | null;
  status?: string;
  from?: string;
  to?: string;
  /** A subject; a main subject also matches its sub-subjects. */
  subjectId?: number | null;
}

export interface HomeworkRecordRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  status: HomeworkRecordStatus | null;
  score: number | null;
  remark: string | null;
}

export interface HomeworkRecordSheet {
  homework: Homework;
  rows: HomeworkRecordRow[];
}

export interface HomeworkRecordInput {
  enrollmentId: number;
  status: HomeworkRecordStatus | null;
  score: number | null;
  remark: string | null;
}

/** One line of a student's homework history: an assignment of a class they were in, with their own record (or none). */
export interface HomeworkHistoryRow {
  homeworkId: number;
  title: string;
  classId: number;
  className: string;
  gradeName: string;
  yearName: string;
  subjectId: number;
  subjectName: string;
  parentSubjectName: string | null;
  assignedDate: string;
  dueDate: string;
  homeworkStatus: HomeworkStatus;
  maxScore: number | null;
  status: HomeworkRecordStatus | null;
  score: number | null;
  remark: string | null;
}

/** Per student of a class over a period: how many assignments, how they stand, and the marks earned out of those possible (marked ones only). */
export interface HomeworkSummaryRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  assigned: number;
  submitted: number;
  late: number;
  notSubmitted: number;
  excused: number;
  marked: number;
  earned: number;
  possible: number;
}

// ---- Phase 4: dashboard, school events, report tables, fees -----------------------------------------------------------

export interface SchoolEvent {
  id: number;
  titleKm: string;
  startDate: string;
  endDate: string | null;
  note: string | null;
  version: number;
}

export interface SchoolEventInput {
  titleKm: string;
  startDate: string;
  endDate: string | null;
  note: string | null;
}

export type FeeCurrency = 'KHR' | 'USD';
export type PaymentMethod = 'CASH' | 'BANK' | 'OTHER';

/** Amounts are in ordinary units of the currency (15000 riel, 12.5 dollars). */
export interface FeeTotal {
  currency: FeeCurrency;
  due: number;
  paid: number;
  balance: number;
}

/** Today's attendance counted the school's official way (`basis`): students in each day status, or the records of every sheet; `sheets` is how many class sheets were taken. */
export interface DashboardAttendance {
  date: string;
  basis: AttendanceBasis;
  classes: number;
  classesRecorded: number;
  sheets: number;
  present: number;
  late: number;
  partial: number;
  absent: number;
  leave: number;
}

export interface DashboardExam {
  id: number;
  nameKm: string;
  kind: ExamKind;
  scoreCount: number;
}

export interface Dashboard {
  currentYear: { id: number; nameKm: string; startDate: string; endDate: string } | null;
  students: { active: number; male: number; female: number };
  activeTeachers: number;
  classes: number;
  attendanceToday: DashboardAttendance;
  recentExams: DashboardExam[];
  events: SchoolEvent[];
  /** null while fees are switched off. */
  fees: { outstanding: FeeTotal[] } | null;
}

export interface FeeCategory {
  id: number;
  nameKm: string;
  defaultAmount: number;
  currency: FeeCurrency;
  active: boolean;
  version: number;
}

export interface FeePayment {
  id: number;
  chargeId: number;
  amount: number;
  currency: FeeCurrency;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  receiptNo: string;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface FeeCharge {
  id: number;
  enrollmentId: number;
  categoryId: number;
  categoryName: string;
  amountDue: number;
  currency: FeeCurrency;
  dueDate: string | null;
  note: string | null;
  paid: number;
  balance: number;
  version: number;
  payments: FeePayment[];
}

export interface FeeLedger {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  className: string;
  gradeName: string;
  yearName: string;
  yearClosed: boolean;
  enrollmentActive: boolean;
  charges: FeeCharge[];
  totals: FeeTotal[];
}

export interface FeeClassRow {
  enrollmentId: number;
  studentId: number;
  studentCode: string;
  nameKm: string;
  totals: FeeTotal[];
}

export interface FeeClassSummary {
  classId: number;
  rows: FeeClassRow[];
  totals: FeeTotal[];
}

export interface FeeReceipt {
  payment: FeePayment;
  studentCode: string;
  studentNameKm: string;
  className: string;
  gradeName: string;
  yearName: string;
  categoryName: string;
  amountDue: number;
  balanceAfter: number;
}

export interface FeeChargeResult {
  created: number;
  skipped: number;
}

/** A report as one table: the same data feeds the preview, the printed page and the Excel file. */
export type ReportColumnType = 'TEXT' | 'INTEGER' | 'DECIMAL' | 'DATE';

export interface ReportColumn {
  label: string;
  type: ReportColumnType;
  /** Width in characters (Excel only). */
  width?: number;
}

export type ReportCell = string | number | null;

export interface ReportTable {
  sheetName: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
}

// ---- Phase 5: backups, restore, the audit trail ------------------------------------------------------------------------

/** Why a backup exists. Manual ones are the user's own; the others are made and rotated by the program. */
export type BackupKind = 'MANUAL' | 'AUTO' | 'PRE_MIGRATION' | 'PRE_RESTORE';

export interface BackupItem {
  /** SchoolBackup_YYYY-MM-DD_HH-mm-ss (the file name without .zip) */
  id: string;
  fileName: string;
  kind: BackupKind;
  createdAt: string;
  sizeBytes: number;
  schemaVersion: number;
  appVersion: string | null;
  /** When it was last read back and proven whole; null when it never was, or was found damaged since. */
  verifiedAt: string | null;
  /** The code it was found damaged with, e.g. BACKUP_CHECKSUM_MISMATCH. */
  verifyError: string | null;
  /** When a copy of it was made on a USB stick or another folder. */
  externalCopyAt: string | null;
}

/** How the last restore ended (`code` is a BACKUP_* or RESTORE_* error code when it did not work). */
export interface RestoreResult {
  ok: boolean;
  at: string;
  code: string | null;
  backupCreatedAt: string | null;
  /** The backup made of the data that was replaced (null when there was nothing to protect or it could not be backed up). */
  safetyBackup: string | null;
  /** A folder in backups/ holding the files of a database too damaged to back up. */
  replacedFolder: string | null;
}

/** A backup chosen for restoring and checked, waiting for the user's yes. Counts only: no names. */
export interface StagedRestore {
  state: 'STAGED' | 'CONFIRMED';
  stagedAt: string;
  backupCreatedAt: string;
  appVersion: string | null;
  schemaVersion: number;
  /** -1 when the backup is from a version that had no such table yet. */
  students: number;
  teachers: number;
  classes: number;
  photos: number;
  totalBytes: number;
}

export interface BackupOverview {
  backups: BackupItem[];
  lastBackupAt: string | null;
  lastVerifiedAt: string | null;
  lastExternalCopyAt: string | null;
  /** The optional reminder to copy a backup to a USB stick, in days; 0 = off (the default). */
  reminderDays: number;
  externalOverdue: boolean;
  /** The backups kept on this laptop: OK = a good backup less than 24 hours old, OLD = the newest good one is 24 hours old or more, NONE = no good backup at all. */
  localState: 'OK' | 'OLD' | 'NONE';
  localAgeHours: number | null;
  autoDue: boolean;
  /** -1 when unknown */
  freeMb: number;
  neededMb: number;
  lastRestore: RestoreResult | null;
  staged: StagedRestore | null;
}

export interface RestoreState {
  staged: StagedRestore | null;
  lastRestore: RestoreResult | null;
}

export interface AuditRow {
  id: number;
  /** ISO instant */
  at: string;
  actor: string | null;
  /** A code such as STUDENT_CREATED: the UI turns it into Khmer. */
  action: string;
  entityType: string | null;
  entityId: number | null;
  /** A short technical sentence (English), shown as detail only. */
  summary: string | null;
}

export interface AuditPage {
  rows: AuditRow[];
  hasMore: boolean;
}

export interface AuditFilters {
  actions: string[];
  actors: string[];
  entityTypes: string[];
}

export interface AuditQuery {
  from?: string;
  to?: string;
  action?: string;
  actor?: string;
  entityType?: string;
  beforeId?: number;
  limit?: number;
}

// ---- identity, version and school acceptance --------------------------------------------------------------------------------

/** Who the program is. One authoritative file, release/release.json; the page never types a version. */
export interface ProductInfo {
  name: string;
  shortName: string;
  developer: string;
  version: string;
  channel: string;
  copyright: string;
}

export type AcceptanceDevelopment = 'COMPLETED' | 'IN_PROGRESS';
/** What is still pending for the school: a choice, an official source, or a test on real equipment. */
export type AcceptancePending = 'CONFIGURATION' | 'OFFICIAL_INFORMATION' | 'PHYSICAL_TESTING';

export interface AcceptanceSignOff {
  signedBy: string;
  at: string;
  note: string | null;
}

export interface AcceptanceItem {
  id: string;
  group: 'information' | 'hardware';
  /** Whether the program side of it is built and tested. Says nothing about the school. */
  development: AcceptanceDevelopment;
  pending: AcceptancePending;
  /** Only the school's administrator can create this; a build never does. */
  signOff: AcceptanceSignOff | null;
}

// ---- the weekly timetable (backend: timetable/*). Days are 1 = Monday ... 7 = Sunday. -----------------------------------------------------

export interface TimetableSlot {
  id: number;
  academicYearId: number;
  nameKm: string;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  /** A break is a shaded row that never holds a lesson. */
  breakSlot: boolean;
  version: number;
  /** How many lessons (of every class) sit in this slot. */
  lessons: number;
}

export interface TimetableSettings {
  yearId: number;
  yearName: string;
  yearClosed: boolean;
  days: number[];
  /** True while the year has chosen no school days of its own: Monday to Friday is the program's default. */
  daysAreDefault: boolean;
  slots: TimetableSlot[];
  lessons: number;
}

export interface TimetableLesson {
  id: number;
  classId: number;
  className: string;
  gradeName: string;
  dayOfWeek: number;
  slotId: number;
  subjectId: number;
  subjectName: string;
  teacherId: number;
  teacherName: string;
  /** False when the teacher was made inactive after the lesson was placed (the lesson keeps them). */
  teacherActive: boolean;
  version: number;
}

export interface TimetableGrid {
  days: number[];
  daysAreDefault: boolean;
  slots: TimetableSlot[];
  lessons: TimetableLesson[];
}

export interface TimetableSubjectChoice {
  id: number;
  nameKm: string;
  /** The teacher the class has for this subject: the default of a cell. */
  teacherId: number | null;
  teacherName: string | null;
  teacherActive: boolean;
}

export interface TimetableTeacherChoice {
  id: number;
  nameKm: string;
  teacherCode: string;
  /** Teaches something in this class (the cell offers these first). */
  assigned: boolean;
}

export interface TimetableClassView {
  classId: number;
  className: string;
  gradeId: number;
  gradeName: string;
  yearId: number;
  yearName: string;
  yearClosed: boolean;
  grid: TimetableGrid;
  subjects: TimetableSubjectChoice[];
  teachers: TimetableTeacherChoice[];
}

export interface TimetableTeacherView {
  teacherId: number;
  teacherName: string;
  teacherActive: boolean;
  yearId: number;
  yearName: string;
  yearClosed: boolean;
  grid: TimetableGrid;
  /** The teacher's lessons in the week, across every class. */
  lessonCount: number;
}

export interface TimetableStudentView {
  studentId: number;
  /** NOT_ENROLLED = the student has no class in that year (an empty state, not an error). */
  state: 'OK' | 'NOT_ENROLLED';
  classId: number | null;
  className: string | null;
  gradeName: string | null;
  yearId: number;
  yearName: string;
  yearClosed: boolean;
  grid: TimetableGrid;
}

export interface TimetableTeacherLoad {
  teacherId: number;
  lessons: number;
}

export interface TimetableCopiedLesson {
  classId: number;
  className: string;
  gradeName: string;
  dayOfWeek: number;
  slotName: string;
  subjectId: number;
  subjectName: string;
  teacherId: number;
  teacherName: string;
}

export type TimetableSkipReason = 'SUBJECT_NOT_OFFERED' | 'NO_TEACHER_ASSIGNED' | 'TEACHER_INACTIVE' | 'TEACHER_CLASH' | 'CELL_OCCUPIED' | 'DAY_DISABLED' | 'CLASS_NOT_IN_YEAR';

export interface TimetableSkippedLesson {
  className: string;
  gradeName: string;
  dayOfWeek: number;
  slotName: string;
  subjectName: string;
  reason: TimetableSkipReason;
  /** For TEACHER_CLASH: the class the teacher is already in. */
  detail: string | null;
}

/** A copy's answer. With `preview` true nothing was written: it is the list of what WOULD happen. */
export interface TimetableCopyResult {
  preview: boolean;
  /** Slots copied (a year copy). */
  slots: number;
  /** Lessons of the target class that "replace" removes (a class copy). */
  replaced: number;
  copied: TimetableCopiedLesson[];
  skipped: TimetableSkippedLesson[];
}

// ---- the dashboard's charts (backend: dashboard/DashboardChartsService, GET /dashboard/charts; read only) --------------------------------------------------------------------

export interface ChartsGender {
  male: number;
  female: number;
  /** Whatever is left of the active students after boys and girls: an unrecorded value stays in the totals. */
  unknown: number;
  total: number;
}

export interface ChartsGradeBar {
  gradeId: number;
  level: number;
  nameKm: string;
  male: number;
  female: number;
  unknown: number;
}

export interface ChartsAttendancePoint {
  /** yyyy-MM-dd */
  date: string;
  /** False = a weekday with no attendance record at all: a GAP (every figure is null), never a zero. */
  recorded: boolean;
  /** How many classes recorded that day (a class that did not is not counted as absent). */
  classesRecorded: number;
  present: number | null;
  late: number | null;
  partial: number | null;
  absent: number | null;
  leave: number | null;
  total: number | null;
  /** Present ÷ all recorded students, in percent; null for a gap and for a sheet with no record. */
  presentPercent: number | null;
}

export interface ChartsAttendance {
  basis: AttendanceBasis;
  classes: number;
  days: ChartsAttendancePoint[];
}

export interface ChartsClassFill {
  classId: number;
  nameKm: string;
  gradeName: string;
  level: number;
  students: number;
  /** The capacity stored for the class; null when there is none (the chart then shows the head count alone). */
  capacity: number | null;
}

export interface ChartsExamClass {
  classId: number;
  nameKm: string;
  gradeName: string;
  students: number;
  complete: number;
  incomplete: number;
  /** Mean percentage of the students whose result is complete (the report cards' own figures); null when nobody is complete. */
  averagePercent: number | null;
  passed: number;
  failed: number;
}

export interface ChartsExam {
  examinationId: number;
  nameKm: string;
  kind: ExamKind;
  passPercent: number | null;
  scaleName: string | null;
  classes: ChartsExamClass[];
}

export interface ChartsFeeMonth {
  /** yyyy-MM */
  month: string;
  collected: number;
}

export interface ChartsFeeSeries {
  /** One series per currency: currencies are never added together or converted. */
  currency: FeeCurrency;
  months: ChartsFeeMonth[];
}

export interface ChartsFees {
  months: string[];
  series: ChartsFeeSeries[];
}

export interface DashboardCharts {
  /** Null while there is no current year (then the lists are empty). */
  year: { id: number; nameKm: string } | null;
  gender: ChartsGender;
  studentsByGrade: { grades: ChartsGradeBar[]; notInAClass: number };
  attendance: ChartsAttendance;
  classFill: ChartsClassFill[];
  /** Null until an examination of the year has a score. */
  latestExam: ChartsExam | null;
  /** Null while fees are switched off. */
  fees: ChartsFees | null;
}
