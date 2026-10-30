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
