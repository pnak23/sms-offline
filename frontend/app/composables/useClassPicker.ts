import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import type { AcademicYear, ClassDto } from '~/types/api';
import { compareKhmer } from '~/utils/sort';

/**
 * The academic year + class choice that attendance, scores, results, report cards and homework share. The current year is chosen
 * first; picking another year loads its classes and clears a class that does not belong to it. With `classOptional` the class
 * may stay empty ("all classes"); otherwise the first class is chosen for you.
 */
export function useClassPicker(options: { classOptional?: boolean } = {}) {
  const { messageFor } = useApiError();

  const years = ref<AcademicYear[]>([]);
  const classes = ref<ClassDto[]>([]);
  const yearId = ref<number | null>(null);
  const classId = ref<number | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const year = computed(() => years.value.find((y) => y.id === yearId.value) ?? null);
  const schoolClass = computed(() => classes.value.find((c) => c.id === classId.value) ?? null);
  const closed = computed(() => year.value?.status === 'CLOSED');

  async function loadClasses(): Promise<void> {
    if (yearId.value === null) {
      classes.value = [];
      classId.value = null;
      return;
    }
    const list = await classesApi.list({ yearId: yearId.value });
    classes.value = [...list].sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
    if (!classes.value.some((c) => c.id === classId.value)) classId.value = options.classOptional ? null : (classes.value[0]?.id ?? null);
  }

  async function load(): Promise<void> {
    error.value = null;
    try {
      years.value = await academicApi.years();
      if (yearId.value === null) yearId.value = (years.value.find((y) => y.current) ?? years.value[0])?.id ?? null;
      await loadClasses();
    } catch (raised) {
      error.value = messageFor(raised);
    } finally {
      loading.value = false;
    }
  }

  watch(yearId, () => {
    loadClasses().catch((raised) => {
      error.value = messageFor(raised);
    });
  });

  return { years, classes, yearId, classId, year, schoolClass, closed, loading, error, load };
}
