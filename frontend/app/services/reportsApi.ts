import type { ReportTable } from '../types/api';
import { http } from './http';

export const reportsApi = {
  /** Any report table as an .xlsx: the same table the preview and the printed page show. The bytes are saved through the desktop bridge. */
  exportTable: (table: ReportTable) => http.postBlob('/reports/export', table),
};
