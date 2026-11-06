import type { SelectOption } from '~/components/ui/FormSelect.vue';
import { EXAM_KINDS } from '~/schemas/exam';
import type { AttendanceStatus, Gender, HomeworkStatus, PromotionOutcome, Relationship, StudentStatus } from '~/types/api';

const GENDERS: Gender[] = ['MALE', 'FEMALE'];
const RELATIONSHIPS: Relationship[] = ['FATHER', 'MOTHER', 'GRANDPARENT', 'SIBLING', 'UNCLE_AUNT', 'OTHER'];
const STUDENT_STATUSES: StudentStatus[] = ['ACTIVE', 'INACTIVE', 'GRADUATED'];
const OUTCOMES: PromotionOutcome[] = ['PROMOTED', 'REPEATED', 'GRADUATED'];
export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];
const HOMEWORK_STATUSES: HomeworkStatus[] = ['ASSIGNED', 'DONE', 'CANCELLED'];

/** Khmer names for the fixed codes the backend sends (gender, relationship, student status, enrollment status, promotion outcome, attendance, examination kind, homework status). */
export function useLabels() {
  const { t } = useI18n();
  const options = <T extends string>(values: readonly T[], prefix: string): SelectOption[] => values.map((value) => ({ value, label: t(`${prefix}.${value}`) }));

  return {
    genderOptions: computed(() => options(GENDERS, 'gender')),
    relationshipOptions: computed(() => options(RELATIONSHIPS, 'relationship')),
    studentStatusOptions: computed(() => options(STUDENT_STATUSES, 'studentStatus')),
    outcomeOptions: computed(() => options(OUTCOMES, 'promotion.outcome')),
    examKindOptions: computed(() => options(EXAM_KINDS, 'exams.kind')),
    homeworkStatusOptions: computed(() => options(HOMEWORK_STATUSES, 'homework.status')),
    genderLabel: (code: string) => t(`gender.${code}`),
    relationshipLabel: (code: string) => t(`relationship.${code}`),
    studentStatusLabel: (code: string) => t(`studentStatus.${code}`),
    enrollmentStatusLabel: (code: string) => t(`enrollmentStatus.${code}`),
    teacherStatusLabel: (code: string) => t(`teacherStatus.${code}`),
    attendanceStatusLabel: (code: string) => t(`attendance.status.${code}`),
    examKindLabel: (code: string) => t(`exams.kind.${code}`),
    homeworkStatusLabel: (code: string) => t(`homework.status.${code}`),
  };
}
