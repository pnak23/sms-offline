import type { AppSettings, SchoolProfile, SchoolProfileInput } from '../types/api';
import { http } from './http';

export const settingsApi = {
  school: () => http.get<SchoolProfile>('/settings/school'),

  updateSchool: (body: SchoolProfileInput) => http.put<SchoolProfile>('/settings/school', body),

  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.postForm<SchoolProfile>('/settings/school/logo', form);
  },

  deleteLogo: () => http.delete<SchoolProfile>('/settings/school/logo'),

  /** The logo is fetched with the session token and shown through a blob URL. */
  logoBlob: (fileName: string) => http.blob(`/files/school/${encodeURIComponent(fileName)}`),

  app: () => http.get<AppSettings>('/settings/app'),

  updateApp: (values: AppSettings) => http.put<AppSettings>('/settings/app', values),
};
