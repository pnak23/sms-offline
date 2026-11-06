import { z } from 'zod';
import { toIsoDate } from '../utils/date';

// Mirrors TeacherController.TeacherRequest. The gender is a select, so "nothing chosen" is the empty string.
export const teacherSchema = z.object({
  nameKm: z.string().trim().min(1, 'REQUIRED').max(100, 'Size'),
  gender: z.string().refine((v): boolean => v === 'MALE' || v === 'FEMALE', 'REQUIRED'),
  phone: z.string().trim().max(50, 'Size'),
  specialization: z.string().trim().max(150, 'Size'),
  address: z.string().trim().max(500, 'Size'),
  employmentDate: z.string().refine((v) => v === '' || toIsoDate(v) !== null, 'INVALID_DATE'),
});

export type TeacherValues = z.infer<typeof teacherSchema>;
