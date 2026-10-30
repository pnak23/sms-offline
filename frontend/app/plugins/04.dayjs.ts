import dayjs from 'dayjs';
import 'dayjs/locale/km';

// Dates are formatted with the Khmer locale (month names); see utils/date.ts.
export default defineNuxtPlugin(() => {
  dayjs.locale('km');
});
