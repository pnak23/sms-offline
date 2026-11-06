# Khmer wording that needs a native speaker's review

All UI text lives in `i18n/locales/km.json`. The Khmer was drafted by an AI assistant and is **not final**. Nothing below is
known to be wrong; these are the places where I am least sure (word choice, register, or technical terms that have no
settled Khmer equivalent). Please check them first, in this order. Change the text in `km.json` only: no code changes needed.

## 1. Terms that decide the tone of the whole app

| Key / where | Current text | Doubt |
|---|---|---|
| `recovery.*`, `auth.recover.*`, `print.recoveryKey.*` | **កូនសោស្តារ** (recovery key) | "Key" as in a physical key. Alternatives: កូដស្តារ, លេខកូដស្តារ, កូនសោសង្គ្រោះ. Used in ~40 strings, so one decision changes them all. |
| `auth.password`, all `*Password*` | **ពាក្យសម្ងាត់** | Alternative: លេខសម្ងាត់ (common on banking apps). |
| `nav.lock`, `lock.title`, `lock.unlock` | ចាក់សោអេក្រង់ / អេក្រង់ត្រូវបានចាក់សោ / ដោះសោ | Is "ចាក់សោ" natural for locking a screen? |
| `nav.dashboard` | ផ្ទាំងគ្រប់គ្រង | Alternatives: ផ្ទាំងព័ត៌មាន, ទំព័រដើម. |
| `auth.notice.SESSION_EXPIRED`, `error.UNAUTHENTICATED` | **សម័យប្រើប្រាស់** (session) | A technical term; maybe "ការចូលប្រើប្រាស់" reads better to a school secretary. |
| `health.*` (memory), `common` | **អង្គចងចាំ** (memory/RAM) | Alternative: ម៉ែម៉ូរី / RAM. |
| `backendDown.*`, `health.resources.backend` | **សេវាទិន្នន័យ** ("data service" for the Spring backend) | Internal concept explained to non-technical users. |
| `health.openLogs`, `health.checks.LOG_SIZE.*` | **កំណត់ហេតុ** (log) | Alternative: កំណត់ត្រា. |
| `settings.school.logo*` | **និមិត្តសញ្ញាសាលា** (logo) | Alternative: ឡូហ្គោ (loan word, very common). |
| `common.skipForNow` | **រំលងសិន** | Short on purpose (a button); is it too casual? |

## 2. Sentences with technical content (please check they are understandable, not just grammatical)

- `health.checks.DATABASE.FOREIGN_KEYS_OFF` - "ការការពារទំនាក់ទំនងរវាងទិន្នន័យមិនបានបើកទេ" (foreign-key enforcement is off).
- `health.checks.DATABASE.JOURNAL_NOT_WAL` - "របៀបសរសេរដែលមានសុវត្ថិភាពបំផុត" (WAL journal mode).
- `health.checks.SCHEMA_VERSION.MIGRATIONS_PENDING` - "មិនទាន់ទាន់សម័យ ... ជំហានត្រូវធ្វើ" (migrations pending); "មិនទាន់ទាន់សម័យ" is clumsy.
- `health.checks.DIRTY_SHUTDOWN.*` - "កម្មវិធីមិនបានបិទដោយត្រឹមត្រូវ (ឧទាហរណ៍ អស់ភ្លើង)".
- `health.checks.DB_INTEGRITY.*` - "ទិន្នន័យមានទំនាក់ទំនងមិនត្រឹមត្រូវ" (foreign-key violations), "រកឃើញទិន្នន័យខូចខាត" (integrity check failed).
- `health.checks.UPLOADS_CONSISTENCY.ORPHAN_UPLOADS` - "មានឯកសាររូបភាព {count} ដែលមិនត្រូវបានប្រើ" (orphan files).
- `health.checks.CLOCK_SANITY.*` - "នាឡិការបស់កុំព្យូទ័រ" (the PC clock).
- `validation.PASSWORD_TOO_LONG` and `auth.passwordRules` - they explain the 72-**byte** limit as "72 បៃ (ប្រហែល 24 តួអក្សរខ្មែរ)". Is "បៃ" understood, or should it be reworded to hide bytes completely ("យ៉ាងច្រើន 24 តួអក្សរខ្មែរ")?
- `recovery.noCopyNote` - explains why there is no copy button (clipboard history). Maybe too technical.

## 3. Longer explanatory paragraphs (tone and length)

- `setup.welcome.intro`, `setup.admin.intro`, `setup.recoveryKey.intro`, `setup.school.intro`
- `recovery.warnBody` (the most important warning in the app), `security.regenerate.intro`, `security.forced.explain`
- `print.recoveryKey.*` (printed on paper and kept for years: wording should be formal)
- `setup.preferences.idleLockHint`, `setup.finish.*`, `dashboard.tasks.*`

## 4. Style decisions to confirm

1. **Digits.** All numbers in UI text and dates use Arabic digits (7, 10, 2026) because they come from code (dayjs, `Intl`,
   the API). Only the school's own data keeps whatever was typed (e.g. grade names "ថ្នាក់ទី១" from the database seed use
   Khmer digits). Phase 4 adds an option for Khmer numerals on reports. Is the mix acceptable for the screens?
2. **Dates.** Short form: "30 តុលា 2026" (`D MMMM YYYY`, dayjs `km` month names). Formal form on the printed key sheet:
   "ថ្ងៃទី30 ខែតុលា ឆ្នាំ2026" (no space between ថ្ងៃទី and the number, as in formal Khmer). Check the month names from
   dayjs' `km` locale (មករា ... ធ្នូ) and the spacing.
3. **Quotes.** Button names inside sentences use « » (e.g. «ចាប់ផ្តើមប្រើប្រាស់»). Fine?
4. **Arrow in paths.** "ការកំណត់ → ព័ត៌មានសាលា" is used to point at a menu path.
5. **Mixed Latin text.** PDF, PNG, JPG, USB, SQLite, Java, MB, GB, Windows are left in Latin script on purpose.
6. **Politeness.** The UI addresses the user neutrally (no ខ្ញុំ/លោក/អ្នក pronoun except "អ្នក" in a few instructions).
   The lock screen greets with "សួស្តី {name}!". Too informal for a school office?

## 5. Not translated on purpose

Backend codes never reach the user as text. `error.*` and `validation.*` keys map every code the backend can send
(a unit test, `tests/i18n.test.ts`, scans the backend source and fails if a new code has no Khmer text).

## 6. Added in Phase 2a (academic setup) — also drafted by the AI assistant, not final

| Key / where | Current text | Doubt |
|---|---|---|
| `nav.preferences`, `settings.preferences.title` | **ការកំណត់ទូទៅ** (general settings) | Alternatives: ចំណូលចិត្ត, ការកំណត់កម្មវិធី. |
| `academic.year.close` / `closeTitle` / `closed` | **បិទឆ្នាំសិក្សា** / **បានបិទ** | Is "បិទ" (close) the natural word for finishing a school year? Alternative: បញ្ចប់ឆ្នាំសិក្សា. |
| `academic.year.reopen` | **បើកឡើងវិញ** | Alternative: បើកម្តងទៀត. |
| `academic.year.makeCurrent` | **កំណត់ជាឆ្នាំបច្ចុប្បន្ន** | "Current year" = ឆ្នាំបច្ចុប្បន្ន; also used as the badge **បច្ចុប្បន្ន** (existing). |
| `academic.year.closeMessage` | the warning shown before closing | Long; check it is clear to a non-technical reader. |
| `academic.subjects.rename` | **ប្តូរឈ្មោះ** | A link next to every subject. |
| `academic.grades.matrixTitle` / `matrixIntro` | **មុខវិជ្ជាតាមថ្នាក់** | Table of "which grade studies which subject". |
| `academic.grades.matrixCell` | "{subject} សម្រាប់ {grade}" | Read by screen readers for every tick box. |
| `error.ACADEMIC_YEAR_CLOSED` | the sentence shown when a closed year is edited | Mentions reopening. |

## 7. Added in Phase 2 (teachers, classes, students, promotion) — AI-drafted, not final

| Key / where | Current text | Doubt |
|---|---|---|
| `nav.schoolGroup`, `nav.students`, `nav.teachers`, `nav.classes` | សាលា · សិស្ស · គ្រូបង្រៀន · ថ្នាក់រៀន | "ថ្នាក់" means both "grade" and "class"; the screens use ថ្នាក់ទី (grade) and ថ្នាក់ + name (class, e.g. ក). Is that clear? |
| `studentStatus.*` | កំពុងសិក្សា · ឈប់រៀន · បញ្ចប់ការសិក្សា | Alternatives: សកម្ម / អសកម្ម. |
| `enrollmentStatus.*` | បានឡើងថ្នាក់ · ត្រួតថ្នាក់ · បានប្តូរថ្នាក់ · បានចាកចេញពីសាលា | "ត្រួតថ្នាក់" for "repeat a year" — is it the word schools use? |
| `students.code`, `teachers.code` | លេខសម្គាល់សិស្ស / គ្រូ | Alternative: អត្តលេខ. |
| `relationship.*` | ឪពុក · ម្តាយ · ជីដូនជីតា · បងប្អូន · ពូ ឬមីង · ផ្សេងៗ | |
| `students.duplicateMessage` | the "possible duplicate" warning | Should be clear to a non-technical reader; mentions twins. |
| `students.deleteMessage`, `error.STUDENT_HAS_HISTORY` | when deleting is allowed | Long; check the wording about "history". |
| `students.move.*` | ចុះឈ្មោះចូលថ្នាក់ · ប្តូរថ្នាក់ · ចាកចេញពីសាលា (+ intros) | "ចាកចេញពីសាលា" for "leave the school". |
| `promotion.*` | ឡើងថ្នាក់, the intro, the summary line "សិស្សមុន + ថែម = សរុប / ចំណុះ" | The most technical screen; please read the whole page aloud. |
| `classes.capacity*` | ចំនួនសិស្សអតិបរមា · ចំណុះ · លើសចំណុះ | "ចំណុះ" for "capacity". |
| `classes.teacherOf` | "គ្រូបង្រៀនមុខវិជ្ជា {subject}" | Read by screen readers for every select. |
| `print.student.*` | the printed student sheet | Formal wording: this goes on paper. |
| Excel column titles (`students.export.*`) | ល.រ · លេខសម្គាល់ · ឈ្មោះខ្មែរ … | They become the first row of the .xlsx. |

## 8. Added in Phase 3 (attendance, examinations, grading, report cards, homework) — AI-drafted, not final

The default band names and the pass mark are **guesses until the school gives its real grading rules** (`docs/PHASE3-PROGRESS.md`, "Defaults in use"); the report card is printed paper, so its wording matters most.

| Key / where | Current text | Doubt |
|---|---|---|
| `nav.studiesGroup`, `nav.attendance`, `nav.exams`, `nav.reportCards`, `nav.homework`, `nav.grading` | ការសិក្សា · វត្តមាន · ការប្រឡង · សន្លឹកពិន្ទុ · កិច្ចការផ្ទះ · មាត្រដ្ឋានពិន្ទុ | "សន្លឹកពិន្ទុ" for "report card": schools may say សៀវភៅតាមដាន / ព្រឹត្តិប័ត្រ. "មាត្រដ្ឋានពិន្ទុ" for "grading scale". |
| `attendance.status.*` | មានវត្តមាន · អវត្តមាន · មកយឺត · សុំច្បាប់ | The four buttons on the daily list. Is "សុំច្បាប់" (took permission) the right word for excused absence? |
| `attendance.markAllPresent`, `unmarked`, `outsideYear` | the button, the counter and the warning about a day outside the academic year | The warning is long. |
| `attendance.discardTitle`, `discardMessage` | the question when changing the class or day with unsaved choices | |
| `exams.kind.*` | ប្រចាំខែ · កណ្តាលឆមាស · ចុងឆមាស · ផ្សេងៗ | Which names does the school use for its examinations (monthly, semester, year-end)? |
| `exams.term`, `termShort` | លេខរៀង (ខែ ឬឆមាស) · លេខ {term} | A number 1–12 that can mean the month or the semester. |
| `exams.weight` | **មេគុណ** | The usual word for a coefficient / weight. |
| `exams.maxScore`, `exams.score`, `exams.absent` | ពិន្ទុអតិបរមា · ពិន្ទុ · អវត្តមាន | |
| `exams.absentHelp`, `exams.absentAsZero` | the notes about decimals, empty boxes and "absent counts as 0" | Printed on the card as a footnote: please check it is fair and clear to parents. |
| `exams.rank`, `total`, `percent`, `band`, `outcome`, `passed`, `failed`, `incomplete` | ចំណាត់ថ្នាក់ · ពិន្ទុសរុប · ភាគរយ · និទ្ទេស · លទ្ធផល · ជាប់ · ធ្លាក់ · មិនទាន់គ្រប់ | "និទ្ទេស" for the grade band (A–F); "ធ្លាក់" may feel harsh on a primary-school card — alternative: មិនទាន់ជាប់. |
| `exams.incompleteNote` | សិស្ស {count} នាក់ មិនទាន់មានពិន្ទុគ្រប់មុខវិជ្ជា… | |
| default bands (database, `V4`) | ល្អប្រសើរ · ល្អណាស់ · ល្អ · ល្អបង្គួរ · មធ្យម · ខ្សោយ (A–F) | **These are the approved defaults, not the school's own.** Letters, wording and cut-offs must come from the real grading rules. |
| `grading.*` | the grading-scale page and form | |
| `reportCards.*` | the report-card list, the comment box | "មតិយោបល់" for the teacher's comment. |
| `print.reportCard.*`, `print.attendance.*` | the printed card and attendance summary: title, "{rank} ក្នុងចំណោម {count}", "មិនទាន់មានលទ្ធផលពេញលេញ", signature captions | Formal wording: this goes on paper. The director's caption is the existing "នាយក/នាយិកា". |
| `homework.*` | កិច្ចការផ្ទះ, status words បានឱ្យ · រួចរាល់ · បានបោះបង់, ហួសកំណត់ | |
| `error.EXAMINATION_HAS_SCORES`, `EXAM_SUBJECT_HAS_SCORES`, `validation.FUTURE_DATE`, `DUE_BEFORE_ASSIGNED`, `BANDS_REQUIRED`, `BAND_ZERO_REQUIRED` | the new refusals | |
| `validation.INVALID_NUMBER` (reworded) | **សូមបញ្ចូលលេខឱ្យបានត្រឹមត្រូវ** | It used to say "whole number"; scores can have decimals. |

## 9. Added in Phase 4 (dashboard, reports, printed-report options, fees) — AI-drafted, not final

Paper and money: the printed header lines, the receipt and the fee wording matter most. The two header lines are the standard national wording typed from memory — **please check the spelling against an official document before anything is printed**.

| Key / where | Current text | Doubt |
|---|---|---|
| `nav.reports`, `nav.fees`, `nav.reportOptions`, `nav.feeSettings` | របាយការណ៍ · ថ្លៃសិក្សា · របាយការណ៍ និងការព្រីន · ការកំណត់ថ្លៃសិក្សា | "ថ្លៃសិក្សា" (tuition) for school fees in general — some schools collect more than tuition. |
| `dashboard.*` (students, teachers, classes, attendance today, recent exams, fees outstanding) | the tiles and cards of the dashboard | "ប្រុស {male} · ស្រី {female}", "មានវត្តមាន … · អវត្តមាន … · យឺត … · ច្បាប់ …". |
| `events.*` | ព្រឹត្តិការណ៍សាលា (school events) and its form | "ព្រឹត្តិការណ៍" or "កម្មវិធី"? |
| `reportOptions.*` | the Settings page for Khmer digits and the national header | Wording of the two switches and the hint. |
| `report.headerLine1`, `headerLine2` (database default, `AppSettingsService`) | **ព្រះរាជាណាចក្រកម្ពុជា** / **ជាតិ សាសនា ព្រះមហាក្សត្រ** | The standard header, off by default. Check the spelling; line 3 is empty (a province / office line, if wanted). |
| `reports.*.title`, `.hint`, `.sheet` | the six reports: បញ្ជីឈ្មោះសិស្ស · បញ្ជីឈ្មោះសិស្សក្នុងថ្នាក់ · សង្ខេបវត្តមាន · តារាងលទ្ធផលប្រឡង · បញ្ជីគ្រូបង្រៀន · របាយការណ៍ថ្លៃសិក្សា | The titles are printed at the top of each report. |
| `reports.results.*` | ពិន្ទុពេញ · កំណត់សម្គាល់ · តាមចំណាត់ថ្នាក់ / តាមអក្ខរក្រម | |
| `fees.due`, `paid`, `balance` | ត្រូវបង់ · បានបង់ · នៅជំពាក់ | Column names in the fee tables and the report. |
| `fees.method.*` | សាច់ប្រាក់ · ធនាគារ · ផ្សេងៗ | How a fee was paid. |
| `fees.currency.*` | រៀល (៛) · ដុល្លារ · រៀល និងដុល្លារ | The dollar sign is left out of the text on purpose (it breaks the translation syntax); amounts show it. |
| `fees.void*`, `fees.voided`, `fees.voidedStamp` | លុបចោល · បានលុបចោល · មូលហេតុ | A payment is never deleted, only voided; "លុបចោល" (cancel/void) — is it clear it is not "delete"? The stamp is printed on a voided receipt. |
| `fees.receipt*`, `fees.payerSignature`, `fees.cashierSignature`, `fees.balanceAfter` | បង្កាន់ដៃទទួលប្រាក់ · លេខបង្កាន់ដៃ · ហត្ថលេខាអ្នកបង់ប្រាក់ · ហត្ថលេខាអ្នកទទួលប្រាក់ · នៅជំពាក់ក្រោយការបង់នេះ | The receipt is printed paper given to a parent. |
| `fees.enableHint`, `fees.classChargeHelp`, `fees.voidHelp`, `fees.ledgerYearClosed` | the long explanations | Long; check they are clear to a non-technical reader (especially that switching fees off loses nothing). |
| `error.FEES_DISABLED`, `FEE_HAS_PAYMENTS`, `ALREADY_VOIDED`; `validation.BELOW_PAID`, `OVERPAYMENT`, `CURRENCY_NOT_ALLOWED`, `FEE_CATEGORY_INACTIVE` | the new refusals | |
| `students.attendanceTitle`, `resultsTitle`, `noAttendance`, `noResults`, `attendanceDays` | the two new cards on the student profile | |
| `exams.scaleIs`, `grading.versionNote` | "មាត្រដ្ឋាន៖ {name}" and the note that editing a used scale makes a new version | The note is long and technical. |

## 10. Added in Phase 5 (backups, restore, history of changes, performance) — AI-drafted, not final

These screens are about protecting the school's data, so the tone matters: calm, specific, never alarming without a reason. Please read the restore dialog and the exit question first.

| Key / where | Current text | Doubt |
|---|---|---|
| `backup.*`, `nav.backup`, `error.BACKUP_*` | **ការបម្រុងទុក** (backup) used as a noun and as the action | The setup wizard already says "ទិន្នន័យបម្រុងទុក"; I use "ការបម្រុងទុក" everywhere else. One of the two should win. |
| `backup.restore.*` (title, intro, review, the three warnings, confirm) | **ស្តារ** (restore) ទិន្នន័យ | The most serious dialog of the program. `warnCredentials` explains that the user name, password **and recovery key go back to what the backup holds**; is "កូនសោស្តារ" (as elsewhere) clear enough here? |
| `backup.sameDiskNote`, `backup.exit.*`, `health.checks.BACKUP_AGE.*` | "ការបម្រុងទុកដែលនៅលើកុំព្យូទ័រនេះតែមួយ មិនអាចសង្គ្រោះបាន…" | The idea that a backup on the same PC is not safe from the disk failing or the PC being stolen. Is it said plainly without frightening? The note also says backups are **not encrypted** and suggests a Windows password. |
| `backup.kind.*` | ធ្វើដោយខ្លួនឯង · ស្វ័យប្រវត្តិ (ពេលបិទកម្មវិធី) · មុនការធ្វើបច្ចុប្បន្នភាព · មុនការស្តារ | The four reasons a backup exists. "មុនការស្តារ" (before a restore) is the one the user needs to find to undo a restore. |
| `backup.status.*`, `backup.verify*`, `health.checks.BACKUP_VERIFY.*` | ត្រឹមត្រូវ · ខូច · មិនទាន់ពិនិត្យ; "បានអានមកវិញទាំងស្រុង" | "Verified" = the file was read back completely and its checksums matched. Is "ត្រឹមត្រូវ" (correct) too weak a word for that? |
| `backup.copy.*` | the messages after copying to a USB stick, including "វាស្ថិតនៅលើថាសដូចគ្នានឹងទិន្នន័យ" (same drive) | Teachers may not know "drive"/"ថាស"; maybe name it "ឌីស C:". |
| `backup.closing.*` | កំពុងបម្រុងទុកទិន្នន័យ… (shown while the program closes) | |
| `error.BACKUP_*`, `error.RESTORE_*` | the reasons a backup file is refused (not a backup, damaged, checksum, newer program, no room) | `BACKUP_CHECKSUM_MISMATCH` is technical; it says the content differs from what was recorded and the file may be damaged or changed. |
| `audit.*` | ប្រវត្តិសកម្មភាព (history of activity) | Alternatives: កំណត់ត្រាសកម្មភាព, កំណត់ហេតុ (the word used for the technical log). |
| `audit.action.*` (about 80 labels), `audit.entity.*` | one label per kind of change, e.g. "ចុះឈ្មោះសិស្ស", "បោះបង់ការបង់ប្រាក់" | Each is a short noun phrase for a table row; check the verbs read naturally. |
| `performance.*` | ល្បឿន និងអង្គចងចាំ; ធម្មតា (ណែនាំ) · សន្សំអង្គចងចាំ; បន្ថយឥទ្ធិពលក្រាហ្វិក | "ក្រាហ្វិក" (graphics) and the hint for people whose screen flickers. |


## 11. Added in the change round after Phase 5 (identity, readiness, attendance sessions, report card template) — AI-drafted, not final

The first group decides how the school's pending items are named to the administrator, so the five state names must be unmistakably different from each other.

| Key / where | Current text | Doubt |
|---|---|---|
| `acceptance.development.*`, `acceptance.state.*`, `acceptance.summary.*`, `acceptance.group.*` | the five states: អភិវឌ្ឍរួចរាល់ · រង់ចាំការកំណត់ · រង់ចាំព័ត៌មានផ្លូវការ · រង់ចាំការសាកល្បងលើឧបករណ៍ពិត · សាលាបានទទួលយកចុងក្រោយ | The words for "pending configuration", "pending official information" and "pending physical testing" must not read as the same thing. Is "សាលាបានទទួលយកចុងក្រោយ" (final acceptance by the school) clear? |
| `acceptance.item.*.title` / `.closes` | the title of each pending item and what closes it | Eleven short phrases; check they say what the school must supply. |
| `acceptance.draft.*`, `acceptance.draft.title` ("មិនទាន់ជាផ្លូវការ") | the "not official yet" notices on the grading, national-header, fee-currency, attendance-session and report-card-template pages, and the line printed on report cards | Printed on paper: "ច្បាប់ពិន្ទុនេះជាតម្លៃបណ្តោះអាសន្ន មិនទាន់ជាផ្លូវការ". Is it polite and clear enough to be shown to a parent? |
| `about.*`, `about.tech.*` | the About page (name, short name, version, channel, developer, copyright, technology) | "ប្រភេទការចេញផ្សាយ" for "release channel", "អ្នកអភិវឌ្ឍន៍ / អ្នកយោង" for the developer / reference name. |
| `attendancePeriods.*`, `nav.attendanceSessions` | **វគ្គវត្តមាន** for "attendance session" (a part of the school day) | "វគ្គ" is also used for training courses. Alternatives: ពេលវេលាសិក្សា, វេនសិក្សា (shift), ម៉ោងសិក្សា. The owner asked for flexible sessions, not shifts, so "វេន" was avoided on purpose. |
| `attendancePeriods.intro`, `.keepsHistory`, `.unconfirmedHint` | the explanation that times are information only, that example times are not official, and that renaming never changes sheets already taken | Long; check a school secretary understands that nothing she edits changes the past. |
| `attendancePeriods.confirm`, `.confirmed`, `.unconfirmed` | បញ្ជាក់ថាជាម៉ោងពិត · សាលាបានបញ្ជាក់ដោយ {name} · មិនទាន់បញ្ជាក់ | The badge shown beside every timed session until the administrator confirms it. |
| `attendance.session`, `.savedAs`, `.noSession`, `.copyFrom`, `.copied` | the session buttons on the attendance screen and the hint that a sheet keeps its old name | `savedAs`: "ឈ្មោះបច្ចុប្បន្នរបស់វគ្គនេះគឺ «…» ប៉ុន្តែសន្លឹកនេះរក្សាឈ្មោះដែលមាននៅពេលកត់ត្រា". |
| (not a `km.json` key) the name given to every year's first session, stored in the database: `AttendancePeriodService.DEFAULT_NAME` and migration V7 | **ពេញមួយថ្ងៃ** (the whole day); the migration also creates **ពេលព្រឹក** / **ពេលរសៀល** for years whose old sheets used morning / afternoon | These three names are data in the school's database, not interface text: changing them here changes only new years. |
| `error.ATTENDANCE_PERIOD_DISABLED`, `ATTENDANCE_ALREADY_RECORDED`, `ATTENDANCE_PERIOD_IN_USE`, `LAST_ENABLED_PERIOD`; `validation.INVALID_TIME`, `END_TIME_BEFORE_START` | the new refusals | `ATTENDANCE_ALREADY_RECORDED` explains that a student has attendance once per day and session, possibly in another class. |
| `audit.action.ATTENDANCE_PERIOD_*`, `ATTENDANCE_DUPLICATE_DROPPED`, `ACCEPTANCE_*`, `audit.entity.attendance_period`, `.acceptance` | audit-trail labels | `ATTENDANCE_DUPLICATE_DROPPED` is written by the upgrade, only when old data had the same student twice in one session. |
| `reportCardTemplate.*`, `nav.reportCardTemplate` | **គំរូសន្លឹកពិន្ទុ** (report card template) and its switches, signature captions, closing note and the preview | Check "អក្សរក្បាលទំព័រជាតិ" (national header), "ប្រអប់ហត្ថលេខា" (signature box) and the note that the layout may use a smaller type to fit one page. |
| `print.reportCard.guardian` | មាតាបិតា ឬអាណាព្យាបាល | The default caption of the third signature box; the first is the director, the second the class teacher. |
| `reportCardTemplate.sample.*` | the made-up student, examination and subjects of the preview | Words only; no real child is ever used. |


## 12. Added with attendance by days and by sessions (2026-11-04) — AI-drafted, not final

The words that matter most are the two units and the new status. A parent or a teacher reads them on every printed attendance table and on every report card, so the difference between a **day** and a **session** must be unmistakable.

| Key / where | Current text | Doubt |
|---|---|---|
| `attendance.unit.DAY` / `.SESSION` | **ថ្ងៃ** (day) / **វគ្គ** (session) | Written in brackets after every count column ("មានវត្តមាន (ថ្ងៃ)"). "វគ្គ" is also the word used for the sessions of the school day on the settings page (§11); alternatives: ពេលសិក្សា, វេន. |
| `attendance.status.PARTIAL` | **មិនពេញថ្ងៃ** (not the whole day) | The new status for a student who attended one session and missed another. Alternatives: មកមួយផ្នែក, មកមិនគ្រប់វគ្គ. It appears as a column on the card, so it should be short. |
| `attendance.totalDays` / `.totalSessions` | ថ្ងៃសរុប / វគ្គសរុប | The last column of every attendance table. |
| `attendance.basis.DAY` / `.SESSION` / `.official` / `.label` | រាប់តាមថ្ងៃ / រាប់តាមវគ្គ / ផ្លូវការ / វិធីរាប់វត្តមាន | The switch on the history and the reports, and the tag "official" next to the school's chosen one. |
| `attendance.basis.title`, `.intro`, `.DAYHint`, `.SESSIONHint`, `.current`, `.saved`, `.unsaved` | the card on Settings → Attendance sessions where the administrator chooses the official method | `intro` explains that a student present in the morning and absent in the afternoon is one partial day, not two days, and that changing the method changes no record. Check it is clear to a school secretary. |
| `dashboard.attendanceSplitDays`, `.attendanceSplitSessions`, `.sheetsToday` | "ថ្ងៃ៖ មាន … · យឺត … · មិនពេញថ្ងៃ … · អវត្តមាន … · ច្បាប់ …" and the sessions line | The line under today's figure on the dashboard. |
| `attendance.recordedDays`, `.recordedSessions`, `.sheetsTaken`, `.students`, `students.attendanceBoth`, `reports.attendance.sessions`, `print.attendance.periodSessions` | "បានកត់ត្រា {n} ថ្ងៃ" / "… វគ្គ", "{days} ថ្ងៃ · {sessions} វគ្គ" | How many days or sessions a period holds; on the printed summary and the student profile. |
| `acceptance.item.attendance-counting.title`, `.closes`, `acceptance.draft.attendanceCounting` | the readiness item and the "the school has not chosen yet" notice | The notice says the program counts by days until the school chooses. |

## 13. Added with the roll of honour (តារាងកិត្តិយស, 2026-11-04) — AI-drafted, not final

The owner showed a sample certificate; the words that also appear on it were copied from it (marked "from the sample"). Everything else was drafted. The artwork is described in `docs/CHANGE-ROUND-PROGRESS.md`; **it should be looked at by a Khmer teacher or designer too**: it is stylised, and the "royal red and gold" style is *not* an authentic Khmer flame pattern.

| Key / where | Current text | Doubt |
|---|---|---|
| `honor.title`, `honor.button` | **តារាងកិត្តិយស** (from the sample) | The title printed on the certificate and the name of the button on the Report cards page. |
| `honor.nationalHint` | **ក្បាលសំបុត្រជាតិ (ព្រះរាជាណាចក្រកម្ពុជា ជាតិ សាសនា ព្រះមហាក្សត្រ) តែងតែបោះពុម្ពនៅខាងលើតារាងកិត្តិយស …** | Tells the person that the national header is always printed on the roll, whatever the style, and that its words come from Settings → Printed reports. The two lines themselves are the program's existing default wording (the owner's picture of 2026-11-04 shows the same words); they still need the official-document check. |
| `honor.field.*` (header, subtitle, dateLines, titleRight, titleLeft) | the five boxes, one for each red box of the school's sample: "ប្រអប់ខាងឆ្វេងលើ (កម្រងសាលា ឈ្មោះសាលា ថ្នាក់)" · "ចំណងជើងរង (ក្រោមពាក្យ «តារាងកិត្តិយស»)" · "ខ្សែថ្ងៃខែ (ខាងស្តាំក្រោម៖ ថ្ងៃខែតាមច័ន្ទគតិ ទីកន្លែង និងកាលបរិច្ឆេទ)" · "ចំណងជើងហត្ថលេខាខាងស្តាំ (គ្រូ)" · "…ខាងឆ្វេង (នាយក)" | The labels say where each box prints. "ថ្ងៃខែតាមច័ន្ទគតិ" is my wording for the lunar calendar date; please check it. |
| the standard wording of the five boxes (`STANDARD_HONOR_TEXTS`, and the backend's defaults of `honor.*`) | `{school}`⏎`{class}` · `លទ្ធផល{exam}` · `{date}` · **គ្រូប្រចាំថ្នាក់** · **បានឃើញ និងឯកភាព**⏎**នាយក/នាយិកា** | What is printed until the school types its own. The school's sample says **នាយកសាលា** (not នាយក/នាយិកា) and **គ្រូបន្ទុកថ្នាក់** (not គ្រូប្រចាំថ្នាក់), "បានឃើញ និងឯកភាព" and, after the lunar date, "ត្រូវនឹង": they can be typed in the boxes now. Which standard should the program start with? |
| `honor.tokens.*` (intro and the six words) | ឈ្មោះសាលា (ពីព័ត៌មានសាលា) · ថ្នាក់នីមួយៗ · ឈ្មោះការប្រឡង · កាលបរិច្ឆេទដែលបានជ្រើស (ថ្ងៃទី… ខែ… ឆ្នាំ…) · ឈ្មោះខែនៃកាលបរិច្ឆេទ · ឆ្នាំនៃកាលបរិច្ឆេទ | Beside the clickable words {school} {class} {exam} {date} {month} {year}. The braces are typed in the boxes exactly like that. |
| `honor.dateHint` | **កាលបរិច្ឆេទនេះជាថ្ងៃដែលនឹងបោះពុម្ព ហើយពាក្យដែលអាស្រ័យលើកាលបរិច្ឆេទ … ប្តូរតាមវា។ កម្មវិធីមិនគណនាថ្ងៃខែតាមច័ន្ទគតិឱ្យទេ …** | Under the date on the Roll of honour page: the date drives the words that depend on it; the lunar date is typed by the school (the program cannot work it out offline). |
| `honor.page.*` (title, subtitle, print, saveDefault, saveHint), `honor.defaults.*` (linesHint, tooManyLines, tooLong, saved, reset, unsaved, previewTitle, previewHint), `honor.intro`, `.count`, `.style.label`, `.date`, `.open`, `.allClasses`, `nav.honorRoll` | the Roll of honour page | "មើលជាមុន និងព្រីន" = preview and print; "រក្សាទុកជាទម្រង់ដើម" = save as the default; `saveHint` explains that the default holds the number of names, the artwork, the five texts and their font styles (not the date or the class). `linesHint` says line breaks and spaces are kept as typed, at most 4 lines and 300 characters per box. "ទម្រង់" (form / template) may not be the word a teacher would use. |
| `honor.format.*` (label, fontLabel, fonts, sizeLabel, sizes, bold, italic, underline, alignLabel, aligns, fit) | the font toolbar above each box: ប្រភេទអក្សរ (អក្សរធម្មតា / អក្សរក្បាលទំព័រ) · ទំហំ (តូច / មធ្យម / ធំ / ធំខ្លាំង) · ដិត · ទ្រេត · គូសបន្ទាត់ក្រោម · តម្រឹម (ឆ្វេង / កណ្តាល / ស្តាំ) · "ឱ្យនៅមួយបន្ទាត់ (បន្ថយទំហំបើវែង)" | The two fonts are the program's text font and its title font (the one the school's name is set in). The last item means a long line shrinks instead of wrapping onto a second line. Please check the words for bold and italic (ដិត, ទ្រេត). |
| `honor.sample.*` | សិស្សគំរូ {n} · ប្រឡងគំរូ · ថ្នាក់ទី១ ក · គ្រូគំរូ | The made-up names in the preview ("sample student 1"); they must be obviously not real. |
| `honor.countOption` | **{count} នាក់ដំបូង** (the first N people) | The choice between 5 and 10. Alternatives: កំពូល {count} នាក់, សិស្សពូកែ {count} នាក់ដំបូង. |
| `honor.style.*` (the first ten names) | មាសបុរាណ · ផ្កាឈូក · ប្រាសាទអង្គរ · ផ្កាយ និងខ្សែបូ · ក្រហម-មាស · ស្លឹកឡូរីយេ · ក្រឡាខៀវ · សម្រាប់កុមារ · បន្ទាត់សាមញ្ញ (សន្សំទឹកប្រឹក) · ព្រះអាទិត្យរះ | "ស្លឹកឡូរីយេ" (laurel leaves) is a made-up descriptive name: is there a usual Khmer word for a laurel wreath? "ក្រឡាខៀវ" describes the woven-line (guilloche) border only roughly. "ទឹកប្រឹក" is ink. |
| `honor.style.*` (**ten more names, added 2026-11-06, my own Khmer, not reviewed by a native speaker**) | ក្បាច់ខ្មែរបៃតង-មាស (`kbach`) · កួរស្រូវ (`rice`) · ដើមត្នោត (`palm`) · ផ្កាកុលាប (`rose`) · ព្រះច័ន្ទ និងផ្កាយ (`moon`) · សៀវភៅ និងខ្មៅដៃ (`book`) · ពណ៌ទង់ជាតិ (`flag`) · ក្រដាសបុរាណ (សន្សំទឹកប្រឹក) (`vintage`) · ទំនើបធរណីមាត្រ (សន្សំទឹកប្រឹក) (`modern`) · រលកសមុទ្រ (`wave`) | These name drawings, not text: please say whether a school would understand each. "ក្បាច់ខ្មែរ" (Khmer ornament) names a flame-like frieze that is **stylised, not an authentic Khmer pattern**; "កួរស្រូវ" (rice ears: is "កួរ" the right word for an ear or a bunch of rice?); "ដើមត្នោត" (sugar palm); "ព្រះច័ន្ទ" for the crescent moon (is "ព្រះច័ន្ទ" too formal for a school certificate? "ខែ" is the everyday word); "ពណ៌ទង់ជាតិ" is only the blue and red bands, with no temple and no national emblem; "ក្រដាសបុរាណ" (old paper, sepia lines) and "ទំនើបធរណីមាត្រ" (modern geometric) carry the same "(សន្សំទឹកប្រឹក)" (saves ink) mark as the simple-line style, because both are drawn with thin lines only. The drawings themselves should also be looked at by a Khmer teacher or designer. |
| `honor.tieNote` | **មានសិស្សបានចំណាត់ថ្នាក់ស្មើគ្នា ដូច្នេះឈ្មោះមានលើសពី {count} នាក់។** | Printed in small type on the certificate when students tied on the last rank make it longer than 5 or 10. |
| `honor.none`, `honor.skipped`, `honor.sheetCount` | "មិនទាន់មានសិស្សណាមានលទ្ធផលពេញលេញ…" · "ថ្នាក់ដែលមិនទាន់មានសិស្សមានលទ្ធផលពេញលេញ (មិនបានព្រីន)៖ {names}" · "{count} ទំព័រ" | Screen only (never printed). |
| the printed date | **ថ្ងៃទី4 ខែវិច្ឆិកា ឆ្នាំ2026** (no space after ថ្ងៃទី; Khmer digits when that setting is on) | This is the program's existing long date (`formatLongDateKm`), the same as on the report card; it is not new to this feature. |

## 14. Added with the monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ, 2026-11-05) — AI-drafted, not final

The owner showed a picture of the list; **its names and figures were only an example**, so only the wording was taken from it (marked "from the sample"). Everything else was drafted. The grades and the pass mark are NOT taken from the picture: they come from the grading scale in Settings (the program's default scale is still a placeholder).

| Key / where | Current text | Doubt |
|---|---|---|
| `nav.monthlyRanking`, `ranking.button`, `ranking.page.title` | **ចំណាត់ថ្នាក់ប្រចាំខែ** (sidebar) · **ភាពចំណាត់ថ្នាក់ប្រចាំខែ** (button and page title, from the sample) | The sidebar says it shorter than the title printed on the list. |
| the standard title (`STANDARD_RANKING_TEXTS.title`, and the backend's default of `ranking.title`) | **ភាពចំណាត់ថ្នាក់ប្រចាំខែ{month} ({schoolYear})** (from the sample) | `{month}` becomes the month of the chosen date and `{schoolYear}` the academic year's name as the school typed it (for example 2025-2026). If the list is for another month the school picks a date in that month or types the month in the title. |
| the standard figures (`STANDARD_RANKING_TEXTS.stats`) | **បញ្ចប់បញ្ជីត្រឹមចំនួនសិស្សសរុប {total} នាក់ ស្រី {female} នាក់** · **សិស្សមានមធ្យមភាគសរុប {passed} នាក់ ស្រី {passedFemale} នាក់** · **សិស្សធ្លាក់មធ្យមភាគសរុប {failed} នាក់ ស្រី {failedFemale} នាក់** (from the sample) | "មានមធ្យមភាគ" (has the average) and "ធ្លាក់មធ្យមភាគ" (failed the average) are the sample's own phrases for passed and failed; are they the school's usual wording? The program counts "passed" as reaching the pass mark of the grading scale. |
| the other standard boxes | `{school}`⏎`{class}` · `{date}` · **គ្រូប្រចាំថ្នាក់** · **បានឃើញ និងឯកភាព**⏎**នាយក/នាយិកា** | The same standard wording as the roll of honour (see §13); they can be changed and saved. |
| the standard column headings (`STANDARD_RANKING_COLUMNS`) | **ល.រ** · **គោត្តនាម និងនាមខ្លួន** · **ភេទ** · **ពិន្ទុសរុប** · **មធ្យមភាគ** · **ចំណាត់ថ្នាក់** · **និទ្ទេស** · **ផ្សេងៗ** and the sex marks **ស** (girl) · **ប** (boy) (from the sample) | "ផ្សេងៗ" (miscellaneous) is the sample's heading of the last column; the program writes **មិនទាន់គ្រប់ពិន្ទុ** there for a student whose result is incomplete. What should the school's own remarks say there? |
| `ranking.incomplete` | **មិនទាន់គ្រប់ពិន្ទុ** (the scores are not complete yet) | Printed in the remarks column of a student who has no rank because a mark is missing. It is not on the sample: my own wording, please check it. |
| `ranking.field.*` (header, title, stats, dateLines, titleRight, titleLeft) | "ប្រអប់ខាងឆ្វេងលើ (ឈ្មោះសាលា និងថ្នាក់)" · "ចំណងជើងបញ្ជី" · "ចំនួនសិស្ស (ក្រោមតារាង៖ សរុប មានមធ្យមភាគ ធ្លាក់មធ្យមភាគ)" · "ខ្សែថ្ងៃខែ (…)" · "ចំណងជើងហត្ថលេខាខាងស្តាំ (គ្រូ)" · "…ខាងឆ្វេង (នាយក)" | The labels say where each box prints. |
| `ranking.tokens.*` (thirteen words) | the six of the roll of honour (§13) plus: ឆ្នាំសិក្សា (ឧ. 2025-2026) · ចំនួនសិស្សសរុបក្នុងថ្នាក់ · ក្នុងនោះសិស្សស្រី · ចំនួនសិស្សមានមធ្យមភាគ (ជាប់) · ក្នុងនោះសិស្សស្រីជាប់ · ចំនួនសិស្សធ្លាក់មធ្យមភាគ · ក្នុងនោះសិស្សស្រីធ្លាក់ | Beside the clickable words {schoolYear} {total} {female} {passed} {passedFemale} {failed} {failedFemale}. The braces are typed in the boxes exactly like that. |
| `ranking.columnsTitle`, `ranking.columnsHint`, `ranking.column.*` | **ចំណងជើងជួរក្នុងតារាង** · "ប្តូរពាក្យនៅក្បាលជួរនីមួយៗ ឬសញ្ញាភេទបាន…" · លេខរៀង · ឈ្មោះសិស្ស · ភេទ · ពិន្ទុសរុប · មធ្យមភាគ · ចំណាត់ថ្នាក់ · និទ្ទេស · ផ្សេងៗ · សញ្ញាភេទស្រី · សញ្ញាភេទប្រុស | The headings editor of the ranking page. |
| `ranking.colours`, `ranking.coloursHint` | **ដាក់ពណ៌ក្នុងតារាង (ក្បាលជួរ ជួរតាមនិទ្ទេស និងជួរ «ផ្សេងៗ»)** · "បើមិនធីក ក្រឡាទាំងអស់ឥតពណ៌ (ថ្លា) នៅសល់តែបន្ទាត់ ដែលសន្សំទឹកប្រឹកពេលព្រីន…" | The tick box under the date and its explanation. "ឥតពណ៌ (ថ្លា)" = without colour (transparent); "ដែលសន្សំទឹកប្រឹក" = which saves ink. |
| `ranking.intro`, `ranking.nationalHint`, `ranking.dateHint`, `ranking.waiting` | the sentences on the page: the list is every student in rank order with total, average, rank and grade taken from the report cards and the grading scale; the national header is always printed; the date drives `{month}`; "មានសិស្ស {count} នាក់ដែលពិន្ទុមិនទាន់គ្រប់ ដូច្នេះមិនមានចំណាត់ថ្នាក់ ហើយមិនរាប់ជាជាប់ ឬធ្លាក់ទេ។" | The last one is shown whenever a class has students with a missing mark: they are listed last, without a rank, and are neither passed nor failed. |
| `ranking.page.*`, `ranking.defaults.*`, `ranking.sample.*`, `ranking.none`, `ranking.skipped`, `ranking.sheetCount` | the ranking page and its print page (the same wording pattern as the roll of honour, §13) | "ទម្រង់ដើម" (default form) again; "{count} ថ្នាក់" = "{count} classes" on the print page. |

## 15. Added with subjects and sub-subjects (migration V8, 2026-11-05) — AI-drafted, not final

The owner said a subject has a **main subject** and **sub-subjects** but did not give the Khmer words, so every word below was drafted. **The most important question: which words does the school itself use?** I used **មុខវិជ្ជាចម្បង** (main subject) and **ផ្នែករង** (sub-subject, literally "sub-part"); "ចាក់សោ" (locked) is used for a structure that can no longer change.

| Key / where | Current text | Doubt |
|---|---|---|
| `academic.subjects.addSub`, `.parent`, `.noParent`, `.parentHint`, `.partOf` | **បន្ថែមផ្នែករង** · **ជាផ្នែករងរបស់មុខវិជ្ជា** · "— គ្មាន (នេះជាមុខវិជ្ជាចម្បង)" · "ផ្នែករងត្រូវបានបើកសម្រាប់ថ្នាក់ដែលមុខវិជ្ជាចម្បងរបស់វាមាន ហើយមិនអាចប្តូរមុខវិជ្ជាចម្បងបានទេ …" · "ជាផ្នែករងរបស់៖ {subject}" | Settings → Academic, under the subject list. "ផ្នែករង" for sub-subject is my word. |
| `exams.addSubSubject`, `.addSubSubjectHelp`, `.subSubject`, `.allSubSubjectsAdded`, `.subSubjectAdded`, `.subSubjectRemoved` | **បន្ថែមផ្នែករង** · "ផ្នែករងត្រូវបន្ថែមក្រោមមុខវិជ្ជាចម្បងរបស់វា ដែលមានក្នុងការប្រឡងនេះសម្រាប់ថ្នាក់នោះរួចហើយ …" · ផ្នែករង · "ផ្នែករងទាំងអស់ត្រូវបានបន្ថែមរួចហើយ ឬមិនមាន" · "បានបន្ថែមផ្នែករង។" · "បានដកផ្នែករងចេញ។" | The examination's Subjects tab. |
| `exams.frozenNote`, `exams.frozenCannotChange` | **មានពិន្ទុបានបញ្ចូលរួចហើយ ដូច្នេះរចនាសម្ព័ន្ធមុខវិជ្ជា (មុខវិជ្ជា និងផ្នែករង) ត្រូវបានចាក់សោ …** · "មិនអាចដកចេញបានទេ ព្រោះមានពិន្ទុបានបញ្ចូលក្នុងការប្រឡងនេះរួចហើយ" | Says why nothing can be added or removed once a score exists, and that a maximum or weight can still be corrected. "រចនាសម្ព័ន្ធ" (structure) may be too technical for a teacher. |
| `exams.subMaxNotConfirmed` | **ពិន្ទុអតិបរមារបស់ផ្នែករងនៅជាតម្លៃបណ្តោះអាសន្ន (១០០) …** | A warning until the first score: the sub-subjects' maxima are the program's placeholder (100), not the school's. |
| `exams.derivedMax` | ផលបូកនៃពិន្ទុអតិបរមារបស់ផ្នែករង (កែនៅបន្ទាត់ផ្នែករង) | The hint on the greyed maximum of a main subject made of sub-subjects. |
| `reportCardTemplate.subSubjects`, `.subSubjectsHint`, `.sample.sub1`, `.sample.sub2` | **បង្ហាញផ្នែករងក្រោមមុខវិជ្ជា** · "បើបើក សន្លឹកពិន្ទុរាយបន្ទាត់ផ្នែករង និងពិន្ទុរបស់វាក្រោមមុខវិជ្ជាដែលមានផ្នែករង … សរុប មធ្យមភាគ និងចំណាត់ថ្នាក់ រាប់តែមុខវិជ្ជាចម្បងប៉ុណ្ណោះ។" · ផ្នែករង ១ / ផ្នែករង ២ | The switch in Settings → Report card (off by default) and the made-up sub-subjects of its preview. |
| `error.EXAM_STRUCTURE_FROZEN` | **មិនអាចបន្ថែម ឬដកមុខវិជ្ជាចេញបានទេ ព្រោះមានពិន្ទុបានបញ្ចូលក្នុងការប្រឡងនេះរួចហើយ។** | |
| `validation.SUB_WITHOUT_MAIN`, `.DERIVED_MAXIMUM`, `.ENTER_AT_SUB_SUBJECTS`, `.MAIN_NOT_IN_EXAMINATION` | "ផ្នែករងអាចបើកបានតែសម្រាប់ថ្នាក់ដែលរៀនមុខវិជ្ជាចម្បងរបស់វា" · "ពិន្ទុអតិបរមារបស់មុខវិជ្ជានេះជាផលបូកនៃផ្នែករងរបស់វា …" · "មុខវិជ្ជានេះមានផ្នែករង សូមបញ្ចូលពិន្ទុនៅផ្នែករងនីមួយៗ" · "មុខវិជ្ជាចម្បងរបស់ផ្នែករងនេះមិនទាន់មានក្នុងការប្រឡងសម្រាប់ថ្នាក់នេះទេ" | Field messages. |
| `audit.action.EXAMINATION_SUB_SUBJECT_ADDED / _UPDATED / _REMOVED`, `audit.entity.sub_subject_score` | បន្ថែមផ្នែករងក្នុងការប្រឡង · កែពិន្ទុអតិបរមារបស់ផ្នែករង · ដកផ្នែករងចេញពីការប្រឡង · ពិន្ទុផ្នែករង | The history of changes page. |

## 16. Added with removing subjects and the Grade 3 demo subjects (2026-11-05) — AI-drafted, not final

The owner gave English names for a Grade 3 sample, so the **Khmer renderings are mine** and only exist in the fictional sample school (labelled "(គំរូ)", sample). They are **not** the school's subject names.

| Key / where | Current text | Doubt |
|---|---|---|
| `academic.subjects.remove`, `.removeTitle`, `.removeMessage`, `.removed`, `.cannotRemoveInUse`, `.cannotRemoveHasSubs` | **លុប** · **លុបមុខវិជ្ជា?** · "លុបមុខវិជ្ជា «{subject}» ចេញពីបញ្ជី? អាចលុបបានតែមុខវិជ្ជាដែលមិនទាន់មានអ្វីប្រើប្រាស់ … ការលុបមិនអាចត្រឡប់វិញបានទេ។" · "បានលុបមុខវិជ្ជា។" · "មិនអាចលុបបានទេ ព្រោះមានការប្រឡង គ្រូប្រចាំមុខវិជ្ជា ឬកិច្ចការផ្ទះប្រើវារួចហើយ។ សូមបិទវាជំនួស។" · "សូមលុបផ្នែករងរបស់វាជាមុនសិន។" | Settings → Academic. "លុប" (delete) rather than "ដកចេញ" (take out) because it cannot be undone. |
| `error.SUBJECT_IN_USE`, `error.SUBJECT_HAS_SUB_SUBJECTS`, `audit.action.SUBJECT_REMOVED` | "មិនអាចលុបមុខវិជ្ជានេះបានទេ ព្រោះមានការប្រឡង គ្រូប្រចាំមុខវិជ្ជា ឬកិច្ចការផ្ទះប្រើវារួចហើយ …" · "មិនអាចលុបមុខវិជ្ជាចម្បងនេះបានទេ ព្រោះវានៅមានផ្នែករង …" · លុបមុខវិជ្ជា | |
| the demo main subjects (`scripts/sample-data/grade3-demo-subjects.json`) | ភាសាខ្មែរ · គណិតវិទ្យា · វិទ្យាសាស្ត្រ · សិក្សាសង្គម · សីលធម៌ · អប់រំកាយ · សិល្បៈ, each followed by **(គំរូ)** | The program's own starting subjects use "សីលធម៌-ពលរដ្ឋវិជ្ជា" and "អប់រំកាយ និងកីឡា"; the demo uses the shorter forms of the English names. |
| the demo sub-subjects | ការអាន (Reading) · ការសរសេរ (Writing) · សរសេរតាមអាន (Dictation) · វេយ្យាករណ៍ (Grammar) · ចំនួន និងការគណនា (Number & Calculation) · ធរណីមាត្រ (Geometry) · ដោះស្រាយបញ្ហា (Problem Solving) · ភាវៈរស់ (Living Things) · បរិស្ថាន (Environment) · វិទ្យាសាស្ត្រមូលដ្ឋាន (Basic Science) · ប្រវត្តិវិទ្យា (History) · ភូមិសាស្ត្រ (Geography) · ពលរដ្ឋវិជ្ជា (Civics) · ចំណេះដឹងសីលធម៌ (Moral Knowledge) · ឥរិយាបថល្អ (Good Behaviour) · សកម្មភាពកាយសម្បទា (Physical Activities) · គំនូរ និងការលាបពណ៌ (Drawing & Painting) | My translations. "សរសេរតាមអាន" for dictation and "សកម្មភាពកាយសម្បទា" for physical activities are the least certain. |

## 17. Added with homework marks (migration V9, 2026-11-05) — AI-drafted, not final

The owner described homework marks in English, so **every word below is my own translation**. The most important question: **which words does the school use for "handed in", "late", "not handed in" and "excused"?** I used **បានប្រគល់** (handed in), **ប្រគល់យឺត** (handed in late), **មិនបានប្រគល់** (not handed in) and **បានលើកលែង** (excused, literally "let off").

| Key / where | Current text | Doubt |
|---|---|---|
| `homework.record.SUBMITTED / LATE / NOT_SUBMITTED / EXCUSED`, `homework.recordStatus`, `homework.notRecorded` | **បានប្រគល់** · **ប្រគល់យឺត** · **មិនបានប្រគល់** · **បានលើកលែង** · ការប្រគល់ · មិនទាន់កត់ត្រា | The four statuses, the column heading and the blank choice. "បានលើកលែង" for excused is the least certain. |
| `homework.hasScore`, `.hasScoreHint`, `.hasScoreLocked`, `.maxScore`, `.maxScoreHint`, `.classLocked`, `.noMarks` | **កិច្ចការនេះមានពិន្ទុ** · "បើបើក គ្រូកំណត់ពិន្ទុអតិបរមា ហើយបញ្ចូលពិន្ទុសិស្សម្នាក់ៗ។ បើមិនបើក វាជាកំណត់ត្រាប៉ុណ្ណោះ។" · "មានពិន្ទុត្រូវបានបញ្ចូលរួចហើយ …" · ពិន្ទុអតិបរមា · "ឧទាហរណ៍ 10 ឬ 20 …" · "សិស្សមានស្ថានភាព ឬពិន្ទុរួចហើយ …" · គ្មានពិន្ទុ | The homework form. |
| `homework.students`, `.studentsColumn`, `.handedInOf`, `.markedOf`, `.averageIs`, `.notRecordedCount`, `.recordsSaved`, `.recordsHelp` | **កត់ត្រាសិស្ស** · ការប្រគល់ និងពិន្ទុ · បានប្រគល់ {done}/{total} · មានពិន្ទុ {done}/{total} · មធ្យម {percent}% · មិនទាន់កត់ត្រា {count} នាក់ · "បានរក្សាទុកកំណត់ត្រាកិច្ចការផ្ទះ។" · "ទុកទទេ = មិនទាន់កត់ត្រា។ ពិន្ទុទទេមិនមែនជា 0 ទេ …" | The list and the students' sheet. |
| `homework.allSubjects`, `.markedCount`, `.averagePercent` | គ្រប់មុខវិជ្ជា · ចំនួនមានពិន្ទុ · ពិន្ទុមធ្យម (%) | The subject filter and two report headings. |
| `reports.homeworkGroup`, `reports.homework.*`, `reports.homeworkMarks.*`, `reports.homeworkSummary.*` | **កិច្ចការផ្ទះ (ឯករាជ្យពីលទ្ធផលប្រឡង)** · បញ្ជីកិច្ចការផ្ទះរបស់ថ្នាក់ · ពិន្ទុកិច្ចការផ្ទះមួយ · សង្ខេបកិច្ចការផ្ទះរបស់សិស្ស · "កិច្ចការផ្ទះមិនត្រូវបានរាប់ក្នុងលទ្ធផលប្រឡងទេ" · "ពិន្ទុរាប់តែកិច្ចការដែលមានពិន្ទុ ហើយសិស្សដែលមិនបានប្រគល់មិនត្រូវរាប់ជា 0 ទេ" · ពិន្ទុទទួលបាន · ពិន្ទុអាចទទួលបាន | The three reports. The two sentences in the subtitles are printed on paper: they should be checked with the school. |
| `students.homeworkTitle`, `.homeworkNote`, `.noHomework`, `.homeworkFigures`, `.homeworkEarned` | កិច្ចការផ្ទះ · "ប្រវត្តិកិច្ចការផ្ទះរបស់សិស្សនេះ។ មិនត្រូវបានរាប់ក្នុងលទ្ធផលប្រឡងទេ។" · … | The card on the student's profile. |
| `validation.HOMEWORK_HAS_MARKS`, `.HOMEWORK_HAS_RECORDS`, `.NO_MAXIMUM`, `audit.action.HOMEWORK_RECORDS_SAVED / _RECORD_CORRECTED / _RECORD_CLEARED`, `audit.entity.homework_record` | "មានពិន្ទុត្រូវបានបញ្ចូលរួចហើយ មិនអាចលុបពិន្ទុអតិបរមាបានទេ" · "សិស្សមានស្ថានភាព ឬពិន្ទុរួចហើយ មិនអាចប្តូរថ្នាក់បានទេ" · "កិច្ចការនេះមិនមានពិន្ទុអតិបរមាទេ …" · រក្សាទុកកំណត់ត្រាសិស្សនៃកិច្ចការផ្ទះ · កែកំណត់ត្រាសិស្សនៃកិច្ចការផ្ទះ · លុបកំណត់ត្រាសិស្សនៃកិច្ចការផ្ទះ · កំណត់ត្រាសិស្សនៃកិច្ចការផ្ទះ | Field messages and the history of changes page. |

## 18. Added with the local-backup policy (2026-11-05) — AI-drafted, not final

The owner decided that backups kept on the laptop are the primary method and that a copy on a USB stick is optional. **Every word below is my own Khmer.** The most important sentences are the ones that say what a backup kept on the laptop does **not** protect against (a failed SSD, a stolen or lost laptop, physical damage): they must be understood by a teacher and a director, not only by a computer person.

| Key / where | Current text | Doubt |
|---|---|---|
| `backup.limits.title`, `.protects`, `.butNot`, `.ssd`, `.theft`, `.damage`, `.usb` | **ការបម្រុងទុកទាំងអស់ត្រូវបានរក្សាទុកនៅលើកុំព្យូទ័រយួរដៃនេះ** · "វាជួយស្តារទិន្នន័យ ប្រសិនបើមានការលុបខុស ការកែខុស ឬទិន្នន័យខូច។" · "ប៉ុន្តែវាមិនការពារទិន្នន័យទេ ប្រសិនបើ៖" · ថាស SSD របស់កុំព្យូទ័រខូច · កុំព្យូទ័រត្រូវបានលួច ឬបាត់ · កុំព្យូទ័រខូចខាតរូបវន្ត (ធ្លាក់ ទឹក ភ្លើង ...) · "ការចម្លងការបម្រុងទុកទៅ USB គឺជាជម្រើសបន្ថែម …" | The notice on the Backup page. "ថាស SSD" is a borrowed word; "ខូចខាតរូបវន្ត" for "physical damage" is the least certain. |
| `backup.status.OK / OLD / NONE` and `…Detail` | **មានការបម្រុងទុកថ្មីៗនៅលើកុំព្យូទ័រនេះ** · **ការបម្រុងទុកចុងក្រោយចាស់ជាង ២៤ ម៉ោង** · **មិនទាន់មានការបម្រុងទុកដែលបានពិនិត្យថាត្រឹមត្រូវ** · "ការបម្រុងទុកល្អចុងក្រោយ៖ {date} ({hours} ម៉ោងមុន)។ …" | The status box at the top of the Backup page. "ដែលបានពិនិត្យថាត្រឹមត្រូវ" = "that was checked and is good" (a backup counts only after it was read back whole). |
| `health.checks.BACKUP_AGE.*` (now the backups on this laptop) | ការបម្រុងទុកចុងក្រោយនៅលើកុំព្យូទ័រនេះ · "ការបម្រុងទុកល្អចុងក្រោយ {hours} ម៉ោងមុន (តិចជាង ២៤ ម៉ោង)។" · "… គឺចាស់ជាង ២៤ ម៉ោង។ សូមចុច «បម្រុងទុកឥឡូវនេះ» ឬបិទកម្មវិធីតាមធម្មតា …" · "មិនទាន់មានការបម្រុងទុកដែលបានពិនិត្យថាត្រឹមត្រូវនៅលើកុំព្យូទ័រនេះទេ។ …" | The health page and the dashboard. |
| `health.checks.EXTERNAL_COPY.*` (the optional USB copy; it used to be `BACKUP_AGE`) | ច្បាប់ចម្លងការបម្រុងទុកនៅ USB (ជម្រើស) · "… នេះជាជម្រើស មិនចាំបាច់សម្រាប់ការប្រើប្រាស់ធម្មតាទេ ប៉ុន្តែការបម្រុងទុកនៅលើកុំព្យូទ័រនេះតែមួយ មិនការពារពីការខូចថាស SSD ការបាត់កុំព្យូទ័រ ឬការខូចខាតរូបវន្តទេ។" | |
| `dashboard.backupOkTitle`, `.backupCopyTitle`, `.backupOpen`, `.backupLimits` | ការបម្រុងទុកទិន្នន័យ · ដល់ពេលចម្លងការបម្រុងទុកទៅ USB · ទំព័របម្រុងទុក · "ការបម្រុងទុកនៅលើកុំព្យូទ័រនេះតែមួយ មិនការពារពីការខូចថាស SSD ការបាត់ ឬលួចកុំព្យូទ័រ ឬការខូចខាតរូបវន្តទេ។" | The dashboard. (`dashboard.backupTitle` "ដល់ពេលបម្រុងទុកទិន្នន័យ" and `.backupAction` "បម្រុងទុកឥឡូវនេះ" were already there.) |
| `setup.preferences.reminderDays`, `.reminderHint`, `.backupWhere` | រំលឹកឱ្យចម្លងការបម្រុងទុកទៅ USB រៀងរាល់ (ថ្ងៃ) — ជម្រើស · "វាយ 0 ដើម្បីមិនរំលឹក (លំនាំដើម) ឬពី 1 ដល់ {max} ថ្ងៃ។ …" · "ការបម្រុងទុកត្រូវបានរក្សាទុកនៅលើកុំព្យូទ័រនេះ ក្នុងថតទិន្នន័យរបស់កម្មវិធី។ …" | The preferences form (wizard and settings). The old "backup folder" lines (`backupFolder`, `chooseFolder`, `chooseLater`, which said the feature would come in a later version) were removed. |
| `backup.summary.copy`, `.neverCopied` | ចម្លងទៅ USB ឬថតផ្សេងចុងក្រោយ (ជម្រើស) · មិនទាន់ធ្លាប់ (មិនចាំបាច់) | The card about the optional copy. |

## 19. Added with the weekly timetable (កាលវិភាគ, migration V10, 2026-11-06) — AI-drafted, not final

> **Status (2026-11-06): the owner confirmed that the Khmer wording of §19 is acceptable; no correction was made** (outcome report: `docs/KHMER-REVIEW-OUTCOME-19-20.md`: 0 of 210 texts corrected, `km.json` byte for byte unchanged; the sheet was `docs/KHMER-REVIEW-SHEET-19-20.md`). This is the owner's confirmation of §19 and §20 only: it is not a review of §1–§18 or of the two Khmer pages, and it does not sign off the readiness item `khmer-wording` (the administrator's act in Settings → About). The text below stays exactly as it was drafted.

The owner approved a weekly timetable per class (a class's week, a teacher's week, a student's week) with school-defined days and time slots. **Every word below is my own Khmer.** The points a native speaker should look at first: the **empty-state** sentences (the program must say "the school has not entered its times yet" without sounding like an error), the **reason** given for each lesson that a copy skips, and the sentence that explains why a clash is refused. The weekday names are the ordinary ones (ច័ន្ទ អង្គារ ពុធ ព្រហស្បតិ៍ សុក្រ សៅរ៍ អាទិត្យ); the school may prefer the "ថ្ងៃ…" form in the column heads.

| Key / where | Current text | Doubt |
|---|---|---|
| `nav.timetable`, `nav.timetableSettings`, `timetable.title`, `.subtitle`, `.settings.title`, `.settings.subtitle` | កាលវិភាគ · ម៉ោងកាលវិភាគ · **កាលវិភាគប្រចាំសប្តាហ៍** · "កាលវិភាគមេរៀនតាមថ្នាក់ និងតាមគ្រូ។ …" · **ម៉ោង និងថ្ងៃសិក្សា** | "កាលវិភាគ" (timetable) against "តារាងម៉ោង" (table of hours): which word does a Cambodian school use for the printed class timetable? The attendance page already says "កាលវិភាគពិតរបស់សាលា". |
| `timetable.day.1 … 7`, `.day.label` | ច័ន្ទ · អង្គារ · ពុធ · ព្រហស្បតិ៍ · សុក្រ · សៅរ៍ · អាទិត្យ · ថ្ងៃ | Column heads without "ថ្ងៃ" to save width. |
| `timetable.time`, `.lessonsInWeek`, `.teacherLessons` | ម៉ោង · "{n} មេរៀនក្នុងមួយសប្តាហ៍" | "មេរៀន" for one lesson in the week (a "period"). Is "ម៉ោងបង្រៀន" the usual word? |
| `timetable.unconfiguredTitle`, `.unconfiguredText` | **មិនទាន់មានម៉ោងសិក្សាទេ** · "សាលាមិនទាន់បានបញ្ចូលម៉ោងសិក្សារបស់ឆ្នាំនេះទេ។ កម្មវិធីមិនបំពេញម៉ោងដោយខ្លួនឯងឡើយ។ …" | **The most important empty state**: it must not read as a fault. |
| `timetable.classEmpty`, `.classEmptyClosed`, `.teacherEmpty`, `.studentNotEnrolled`, `.notEnrolledShort` | ថ្នាក់នេះមិនទាន់មានកាលវិភាគទេ… · ថ្នាក់នេះមិនមានកាលវិភាគទេ។ · គ្រូនេះមិនទាន់មានមេរៀនក្នុងឆ្នាំនេះទេ។ · សិស្សនេះមិនមានថ្នាក់ក្នុងឆ្នាំសិក្សា {year} ទេ… · មិនទាន់មានថ្នាក់ | Other empty states. |
| `timetable.cell.*` (title, subject, teacher, choose…, notAssigned, showAllTeachers, bothRequired, clear, saved, cleared) | ថ្ងៃ{day} · {slot} ({times}) · មុខវិជ្ជា · គ្រូ · មិនប្រចាំថ្នាក់នេះ · បង្ហាញគ្រូដែលកំពុងបង្រៀនទាំងអស់ · **ត្រូវជ្រើសរើសទាំងមុខវិជ្ជា និងគ្រូ ទើបអាចរក្សាទុកបាន។** · ដកមេរៀនចេញ | The small pop-up for one cell. |
| `timetable.clash`, `error.TIMETABLE_TEACHER_CLASH`, `validation.TIMETABLE_TEACHER_CLASH` | **គ្រូនេះមានមេរៀននៅថ្នាក់ {className} រួចហើយ ថ្ងៃ{day} {slot}។** | The refusal that names the other class. |
| `timetable.copy.*` | ចម្លងកាលវិភាគពីថ្នាក់ផ្សេង · "… គ្រូនៃមេរៀនដែលបានចម្លង គឺជាគ្រូប្រចាំមុខវិជ្ជារបស់ថ្នាក់នេះ មិនមែនគ្រូរបស់ថ្នាក់ដើមទេ។ ត្រូវមើលជាមុនសិន ទើបចម្លងបាន។" · មើលជាមុន · ចម្លង · **ការមើលជាមុន៖ នឹងចម្លង {copied} មេរៀន ហើយរំលង {skipped} មេរៀន។ មិនទាន់មានអ្វីត្រូវបានផ្លាស់ប្តូរទេ។** · មេរៀនដែលរំលង និងមូលហេតុ · យកកាលវិភាគពីឆ្នាំសិក្សាមុន | "preview" = "មើលជាមុន"; "skipped" = "រំលង". |
| `timetable.skip.*` (7 reasons) | ថ្នាក់នេះមិនរៀនមុខវិជ្ជានេះទេ · ថ្នាក់នេះមិនទាន់មានគ្រូប្រចាំមុខវិជ្ជានេះ · គ្រូប្រចាំមុខវិជ្ជានេះបានឈប់បង្រៀន · គ្រូមានមេរៀននៅថ្នាក់ {detail} រួចហើយក្នុងម៉ោងនេះ · ប្រអប់នេះមានមេរៀនរួចហើយ · ថ្ងៃនេះមិនមែនជាថ្ងៃសិក្សាទេ · ឆ្នាំនេះមិនមានថ្នាក់ដែលមានកម្រិត និងឈ្មោះដូចគ្នា | The reason shown for every lesson a copy skips. |
| `timetable.settings.*` | ថ្ងៃសិក្សា · "ឆ្នាំនេះមិនទាន់បានជ្រើសរើសថ្ងៃទេ។ ថ្ងៃច័ន្ទដល់ថ្ងៃសុក្រ ជាជម្រើសចាប់ផ្តើមរបស់កម្មវិធី ហើយមិនទាន់ត្រូវបានរក្សាទុកទេ។" · ម៉ោងសិក្សា · ម៉ោងសម្រាក · "ម៉ោងដែលមានមេរៀនអាចប្តូរឈ្មោះ ឬម៉ោងបាន ប៉ុន្តែមិនអាចលុបបានទេ។" · "ឈ្មោះដែលសាលាប្រើ (ឧទាហរណ៍ ម៉ោងទី១ ឬ ម៉ោងសម្រាក)" | The example names in `nameHint` are only names, never times. |
| `timetable.print.landscape`, `reports.timetableClass / Teacher / Student` (title and sheet) | បោះពុម្ពតាមទទឹង (A4 ផ្តេក) · កាលវិភាគថ្នាក់ · កាលវិភាគគ្រូ · កាលវិភាគសិស្ស | "A4 ផ្តេក" for landscape. |
| `students.timetableTitle`, `teachers.timetableTitle` | កាលវិភាគ · កាលវិភាគបង្រៀន | Card headings on the student's and the teacher's page. |
| `error.TIMETABLE_DAY_IN_USE`, `.TIMETABLE_SLOT_IN_USE`, `.TIMETABLE_YEAR_NOT_EMPTY`, `.TIMETABLE_NOTHING_TO_COPY`; `validation.TIMETABLE_DAY_DISABLED`, `.TIMETABLE_YEAR_MISMATCH`, `.TIMETABLE_BREAK_SLOT`, `.TIMETABLE_SLOT_OVERLAP`, `.TIMETABLE_DIFFERENT_GRADE`, `.TIMETABLE_DAY_IN_USE` | មិនអាចដកថ្ងៃនេះចេញបានទេ ព្រោះមានមេរៀនក្នុងថ្ងៃនេះ… · ម៉ោងនេះមានមេរៀន ដូច្នេះមិនអាចលុប ឬប្តូរទៅជាម៉ោងសម្រាកបានទេ… · ឆ្នាំនេះមានម៉ោងសិក្សា ឬមេរៀនរួចហើយ ដូច្នេះមិនអាចចម្លងចូលបានទេ។ · ម៉ោងនេះត្រួតនឹងម៉ោងផ្សេងរបស់ឆ្នាំនេះ · ម៉ោងសម្រាកមិនអាចមានមេរៀនបានទេ … | Refusals. |
| `audit.action.TIMETABLE_*` (9), `audit.entity.timetable_slot`, `.timetable_entry` | ប្តូរថ្ងៃសិក្សានៃកាលវិភាគ · បន្ថែម / កែ / លុបម៉ោងសិក្សានៃកាលវិភាគ · បន្ថែម / កែ / ដកមេរៀនក្នុងកាលវិភាគ · ចម្លងកាលវិភាគពីថ្នាក់ផ្សេង · យកកាលវិភាគពីឆ្នាំសិក្សាផ្សេង · ម៉ោងសិក្សានៃកាលវិភាគ · មេរៀនក្នុងកាលវិភាគ | The history-of-changes page. |
| `acceptance.item.timetable-slots.*`, `acceptance.draft.timetableSlots` | ថ្ងៃ និងម៉ោងនៃកាលវិភាគមេរៀន · ថ្ងៃសិក្សា និងម៉ោងសិក្សាពិតរបស់សាលា ត្រូវបញ្ចូលក្នុងកម្មវិធី · "ថ្ងៃ និងម៉ោងសិក្សានៃកាលវិភាគមិនទាន់បានបញ្ជាក់ពីសាលាទេ។ …" | The readiness item and the notice on Settings → Timetable. |

## 20. Added with the premium dashboard (the hero and six charts, 2026-11-06) — AI-drafted, not final

> **Status (2026-11-06): the owner confirmed that the Khmer wording of §20 is acceptable; no correction was made** (outcome report: `docs/KHMER-REVIEW-OUTCOME-19-20.md`: 0 of 210 texts corrected, `km.json` byte for byte unchanged; the sheet was `docs/KHMER-REVIEW-SHEET-19-20.md`). This is the owner's confirmation of §19 and §20 only: it is not a review of §1–§18 or of the two Khmer pages, and it does not sign off the readiness item `khmer-wording` (the administrator's act in Settings → About). The text below stays exactly as it was drafted.

The owner approved a richer dashboard: a hero with three quick links, and six read-only charts (students by grade, gender, attendance over the last 14 recorded days, class fill, the latest examination, and — only when fees are switched on — fees collected over six months). **Every word below is my own Khmer** (68 texts: `dashboard.hero.*` and `dashboard.charts.*` (67), and one label added on 2026-11-06 with the quiet backup line, `dashboard.backupLimitsToggle`; the review sheet `docs/KHMER-REVIEW-SHEET-19-20.md` lists them all in full, together with §19). The points a native speaker should look at first: the **empty states** (they must not read like a fault), the sentence about **days with no record** (the chart shows a gap, never zero), the **capacity** words, the notice that the **pass mark and grades are not the school's official rules**, and the sentence that **riel and dollars are never added together**. Two of my own first drafts were made more careful before the review (not by a reviewer): the attendance sentence no longer says "working days" (the program has no school calendar, a holiday is also a day without a record: it says "Monday to Friday days with no record"), and the dashed line of the capacity mark is "បន្ទាត់ដាច់ៗ".

| Key / where | Current text | Doubt |
|---|---|---|
| `dashboard.charts.title`, `.showTable`, `.showChart` | ក្រាហ្វិក និងស្ថិតិ · បង្ហាញជាតារាង · បង្ហាញជាក្រាហ្វិក | **"ក្រាហ្វិក" for "chart / graph"** (a borrowed word). Is it the word a Cambodian teacher would use, or "តារាងក្រាហ្វ", "ដ្យាក្រាម", "រូបភាពស្ថិតិ"? "table" is "តារាង". |
| `dashboard.hero.takeAttendance`, `.addStudent`, `.exams` | កត់ត្រាវត្តមាន · បន្ថែមសិស្ស · ការប្រឡង | The three buttons in the blue banner. |
| `dashboard.charts.noYear` and every `*.empty` (`grades`, `gender`, `attendance`, `fill`, `exam`, `fees`) | មិនទាន់មានឆ្នាំសិក្សាបច្ចុប្បន្ន ដូច្នេះមិនទាន់មានអ្វីត្រូវបង្ហាញទេ។ · មិនទាន់មានសិស្សកំពុងសិក្សាទេ។ · "មិនទាន់មានកំណត់ត្រាវត្តមានក្នុងឆ្នាំសិក្សានេះទេ។ ពេលអ្នកកត់ត្រាវត្តមាន ក្រាហ្វិកនឹងបង្ហាញនៅទីនេះ។" · មិនមានការបង់ប្រាក់ក្នុង ៦ ខែចុងក្រោយទេ។ | **The empty states**: a new school sees these on its first day. They must sound calm ("not yet"), not like an error. |
| `dashboard.charts.grades.*` | សិស្សតាមកម្រិតថ្នាក់ · "សិស្ស {total} នាក់ក្នុង {grades} កម្រិតថ្នាក់ · កម្រិតដែលមានសិស្សច្រើនជាងគេ៖ {largest}។" · "មានសិស្ស {n} នាក់ មិនទាន់ចុះក្នុងថ្នាក់ណាមួយក្នុងឆ្នាំនេះ។" | "កម្រិតថ្នាក់" for "grade level" (ថ្នាក់ទី១…ទី៦) against "ថ្នាក់" for one class (ថ្នាក់ទី១ ក). The program already uses both words; please confirm the split. |
| `dashboard.charts.gender.*`, `.unknown` | ភេទរបស់សិស្ស · "សិស្សកំពុងសិក្សាសរុប {total} នាក់៖ ប្រុស {male} · ស្រី {female} · មិនបានបញ្ជាក់ {unknown}។" · **មិនបានបញ្ជាក់** | "មិនបានបញ្ជាក់" (not stated) for a student whose gender is not recorded. The program normally requires a gender, so this shows only if the data is odd; is there a gentler word? |
| `dashboard.charts.attendance.title`, `.summary`, `.summaryNone`, `.gap` | វត្តមាន ១៤ ថ្ងៃដែលបានកត់ត្រាចុងក្រោយ · "{days} ថ្ងៃដែលបានកត់ត្រា · មធ្យម {mean}% មានវត្តមាន · ថ្ងៃចុងក្រោយ {newest}% · **ថ្ងៃច័ន្ទដល់សុក្រដែលគ្មានកំណត់ត្រា {gaps} (បង្ហាញជាចន្លោះ មិនមែនជាសូន្យ)** · {basis}។" · **មិនមានកំណត់ត្រាវត្តមាន** | **The most important sentence of the attendance chart**: a day nobody recorded is a gap, not 0 %. Does "បង្ហាញជាចន្លោះ មិនមែនជាសូន្យ" ("shown as a gap, not as zero") read naturally? Is "ថ្ងៃច័ន្ទដល់សុក្រ" (Monday to Friday) the right way to say it? |
| `dashboard.charts.attendance.day`, `.noRecords`, `.percent`, `.present`, `.late`, `.partial`, `.absent`, `.leave`, `.classes`, `.sparkLabel` | "{date}៖ មានវត្តមាន {percent}% · មាន {present} · យឺត {late} · មិនពេញថ្ងៃ {partial} · អវត្តមាន {absent} · ច្បាប់ {leave} · ថ្នាក់បានកត់ត្រា {n} / {classes}" · "ថ្នាក់ដែលបានកត់ត្រា {n} / {classes} ប៉ុន្តែមិនមានសិស្សក្នុងកំណត់ត្រា" · និន្នាការវត្តមាននៃថ្ងៃដែលបានកត់ត្រាចុងក្រោយ | The sentence read out for one day. The five words (មាន យឺត មិនពេញថ្ងៃ អវត្តមាន ច្បាប់) are the ones already used by attendance (§12). |
| `dashboard.charts.fill.*` | ចំនួនសិស្សក្នុងថ្នាក់ ធៀបនឹងចំណុះ · "{classes} ថ្នាក់ មានសិស្ស {students} នាក់ · ថ្នាក់លើសចំណុះ {over} · ថ្នាក់មិនមានចំណុះកំណត់ {noCapacity}។" · "ចំណុះគឺជាចំនួនដែលបានកំណត់សម្រាប់ថ្នាក់នីមួយៗ (នៅទំព័រថ្នាក់)។ **បន្ទាត់ដាច់ៗ = ចំណុះ។ ពណ៌ក្រហម = លើសចំណុះ។**" · {n} នាក់ (មិនមានចំណុះកំណត់) · {n} នាក់ ក្នុងចំណុះ {capacity} · {n} នាក់ លើសចំណុះ {capacity} | **"ចំណុះ" for a class's capacity** (the maximum number of pupils): is it the usual word? The program never invents a capacity: a class with none stored says "(មិនមានចំណុះកំណត់)" and shows no mark. |
| `dashboard.charts.exam.*` | ការប្រឡងថ្មីបំផុត · ការប្រឡងថ្មីបំផុត៖ {name} · **ពិន្ទុជាប់ និងនិទ្ទេសជាតម្លៃបណ្តោះអាសន្ន មិនមែនជាច្បាប់ផ្លូវការរបស់សាលាទេ។** · ភាគរយមធ្យមតាមថ្នាក់ (ពិន្ទុជាប់ {pass}%) · លទ្ធផលរបស់សិស្ស · មធ្យមភាគ · ជាប់ · ធ្លាក់ · មិនទាន់គ្រប់ពិន្ទុ · "{name}៖ {classes} ថ្នាក់ · ជាប់ {passed} · ធ្លាក់ {failed} · មិនទាន់គ្រប់ពិន្ទុ {incomplete} · ពិន្ទុជាប់ {pass}%។ តួលេខដូចគ្នានឹងសន្លឹកពិន្ទុ។" · មិនទាន់មានសិស្សណាគ្រប់ពិន្ទុទេ (សិស្ស {students} នាក់) | The notice **"not the school's official rule"** must be clear but not alarming. "មិនទាន់គ្រប់ពិន្ទុ" (not all scores entered yet) is the same word as the report cards. "ធ្លាក់" (failed) is blunt on a dashboard: is there a softer word? |
| `dashboard.charts.fees.*` | ថ្លៃសិក្សាដែលបានទទួល ៦ ខែចុងក្រោយ · **ចំនួនទឹកប្រាក់ដែលបានទទួលក្នុងមួយខែ បំបែកតាមរូបិយប័ណ្ណនីមួយៗ។ រៀល និងដុល្លារមិនត្រូវបានបូកបញ្ចូលគ្នា ឬបម្លែងឡើយ។** · បានទទួល · សរុប ៦ ខែ៖ {amount} · បានទទួល {amount} | Only when fees are switched on. The second sentence says riel and dollars are never added or converted. |
| `dashboard.charts.date`, `.month`, `.grade`, `.count`, `.share`, `.total`, `.male`, `.female` | កាលបរិច្ឆេទ · ខែ · កម្រិតថ្នាក់ · ចំនួន · ភាគរយ · សរុប · ប្រុស · ស្រី | Column heads of the "show as table" view. |
| `dashboard.backupLimitsToggle` (added 2026-11-06 with the quiet backup line) | **ដែនកំណត់នៃការបម្រុងទុកនេះ** | The label of the information button on the dashboard's one-line backup status ("the limits of this backup"). It opens the existing sentence `dashboard.backupLimits` (§18, unchanged): "ការបម្រុងទុកនៅលើកុំព្យូទ័រនេះតែមួយ មិនការពារពីការខូចថាស SSD ការបាត់ ឬលួចកុំព្យូទ័រ ឬការខូចខាតរូបវន្តទេ។" **Is "ដែនកំណត់" ("limits") clear to a teacher or a director as a button that explains what a backup kept only on the laptop cannot protect against?** Other wordings to consider: "ហេតុអ្វីមិនគ្រប់គ្រាន់?" ("why is it not enough?") or "ព័ត៌មានបន្ថែម" ("more information"). |
