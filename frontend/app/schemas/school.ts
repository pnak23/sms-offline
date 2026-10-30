import { z } from 'zod';

// Limits mirror SettingsController.SchoolRequest. Messages are validation codes (key `validation.<CODE>`).
export const schoolSchema = z.object({
  nameKm: z.string().trim().min(1, 'REQUIRED').max(200, 'Size'),
  nameEn: z.string().trim().max(200, 'Size'),
  address: z.string().trim().max(500, 'Size'),
  phone: z.string().trim().max(50, 'Size'),
  directorName: z.string().trim().max(150, 'Size'),
});

export type SchoolValues = z.infer<typeof schoolSchema>;
