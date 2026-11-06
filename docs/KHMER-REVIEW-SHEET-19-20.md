# Khmer wording review sheet — The weekly timetable (frontend/i18n/REVIEW.md section 19) + The premium dashboard: the hero and the six charts (frontend/i18n/REVIEW.md section 20)

Generated from `frontend/i18n/locales/km.json`. **Every text below was written by an AI assistant, not by a Khmer speaker.** Please read each one on its own and as it appears on the screen, and write a correction (or leave the column empty if it is right).

* Words in braces, such as `{n}`, `{day}`, `{className}`, are filled in by the program: keep them exactly as they are, anywhere in the sentence.
* Do not use the characters `|`, `@` or `<`, and write each text on one line.
* The points to look at first: the **empty-state** sentences (`timetable.unconfigured*`, `timetable.classEmpty*`, `timetable.teacherEmpty`) must not read like a fault; the **reason for each skipped lesson** (`timetable.skip.*`); the sentence that refuses a clash (`timetable.clash`); and the word for "timetable" itself. **Then**, for the other part: the **empty-state** sentences (`dashboard.charts.noYear`, `*.empty`) must not read like a fault; the sentence about **gaps** (`dashboard.charts.attendance.summary`, `.gap`: a day with no record is shown as a gap, never as zero); the **capacity note** (`dashboard.charts.fill.note`); the **unofficial-grading notice** (`dashboard.charts.exam.unofficial`); the sentence that the two **currencies are never added together** (`dashboard.charts.fees.summary`); and the names of the charts; and the label of the **information button on the quiet backup line** (`dashboard.backupLimitsToggle`), which opens the existing sentence about what a backup kept only on the laptop cannot protect against.

210 texts.

| # | Key | Current text | Correction | Note |
|---|---|---|---|---|
| 1 | `nav.timetable` | កាលវិភាគ | | |
| 2 | `nav.timetableSettings` | ម៉ោងកាលវិភាគ | | |
| 3 | `teachers.timetableTitle` | កាលវិភាគបង្រៀន | | |
| 4 | `students.timetableTitle` | កាលវិភាគ | | |
| 5 | `dashboard.backupLimitsToggle` | ដែនកំណត់នៃការបម្រុងទុកនេះ | | |
| 6 | `dashboard.hero.takeAttendance` | កត់ត្រាវត្តមាន | | |
| 7 | `dashboard.hero.addStudent` | បន្ថែមសិស្ស | | |
| 8 | `dashboard.hero.exams` | ការប្រឡង | | |
| 9 | `dashboard.charts.title` | ក្រាហ្វិក និងស្ថិតិ | | |
| 10 | `dashboard.charts.noYear` | មិនទាន់មានឆ្នាំសិក្សាបច្ចុប្បន្ន ដូច្នេះមិនទាន់មានអ្វីត្រូវបង្ហាញទេ។ | | |
| 11 | `dashboard.charts.showTable` | បង្ហាញជាតារាង | | |
| 12 | `dashboard.charts.showChart` | បង្ហាញជាក្រាហ្វិក | | |
| 13 | `dashboard.charts.male` | ប្រុស | | |
| 14 | `dashboard.charts.female` | ស្រី | | |
| 15 | `dashboard.charts.unknown` | មិនបានបញ្ជាក់ | | |
| 16 | `dashboard.charts.total` | សរុប | | |
| 17 | `dashboard.charts.grade` | កម្រិតថ្នាក់ | | |
| 18 | `dashboard.charts.count` | ចំនួន | | |
| 19 | `dashboard.charts.share` | ភាគរយ | | |
| 20 | `dashboard.charts.date` | កាលបរិច្ឆេទ | | |
| 21 | `dashboard.charts.month` | ខែ | | |
| 22 | `dashboard.charts.grades.title` | សិស្សតាមកម្រិតថ្នាក់ | | |
| 23 | `dashboard.charts.grades.summary` | សិស្ស {total} នាក់ក្នុង {grades} កម្រិតថ្នាក់ · កម្រិតដែលមានសិស្សច្រើនជាងគេ៖ {largest}។ | | |
| 24 | `dashboard.charts.grades.notInAClass` | មានសិស្ស {n} នាក់ មិនទាន់ចុះក្នុងថ្នាក់ណាមួយក្នុងឆ្នាំនេះ។ | | |
| 25 | `dashboard.charts.grades.empty` | មិនទាន់មានសិស្សចុះឈ្មោះក្នុងថ្នាក់ណាមួយ ក្នុងឆ្នាំសិក្សានេះទេ។ | | |
| 26 | `dashboard.charts.gender.title` | ភេទរបស់សិស្ស | | |
| 27 | `dashboard.charts.gender.summary` | សិស្សកំពុងសិក្សាសរុប {total} នាក់៖ ប្រុស {male} · ស្រី {female} · មិនបានបញ្ជាក់ {unknown}។ | | |
| 28 | `dashboard.charts.gender.empty` | មិនទាន់មានសិស្សកំពុងសិក្សាទេ។ | | |
| 29 | `dashboard.charts.attendance.title` | វត្តមាន ១៤ ថ្ងៃដែលបានកត់ត្រាចុងក្រោយ | | |
| 30 | `dashboard.charts.attendance.summary` | {days} ថ្ងៃដែលបានកត់ត្រា · មធ្យម {mean}% មានវត្តមាន · ថ្ងៃចុងក្រោយ {newest}% · ថ្ងៃច័ន្ទដល់សុក្រដែលគ្មានកំណត់ត្រា {gaps} (បង្ហាញជាចន្លោះ មិនមែនជាសូន្យ) · {basis}។ | | |
| 31 | `dashboard.charts.attendance.summaryNone` | មិនទាន់មានកំណត់ត្រាវត្តមានទេ។ | | |
| 32 | `dashboard.charts.attendance.empty` | មិនទាន់មានកំណត់ត្រាវត្តមានក្នុងឆ្នាំសិក្សានេះទេ។ ពេលអ្នកកត់ត្រាវត្តមាន ក្រាហ្វិកនឹងបង្ហាញនៅទីនេះ។ | | |
| 33 | `dashboard.charts.attendance.gap` | មិនមានកំណត់ត្រាវត្តមាន | | |
| 34 | `dashboard.charts.attendance.noRecords` | ថ្នាក់ដែលបានកត់ត្រា {n} / {classes} ប៉ុន្តែមិនមានសិស្សក្នុងកំណត់ត្រា | | |
| 35 | `dashboard.charts.attendance.day` | {date}៖ មានវត្តមាន {percent}% · មាន {present} · យឺត {late} · មិនពេញថ្ងៃ {partial} · អវត្តមាន {absent} · ច្បាប់ {leave} · ថ្នាក់បានកត់ត្រា {n} / {classes} | | |
| 36 | `dashboard.charts.attendance.percent` | % មានវត្តមាន | | |
| 37 | `dashboard.charts.attendance.present` | មាន | | |
| 38 | `dashboard.charts.attendance.late` | យឺត | | |
| 39 | `dashboard.charts.attendance.partial` | មិនពេញថ្ងៃ | | |
| 40 | `dashboard.charts.attendance.absent` | អវត្តមាន | | |
| 41 | `dashboard.charts.attendance.leave` | ច្បាប់ | | |
| 42 | `dashboard.charts.attendance.classes` | ថ្នាក់ដែលបានកត់ត្រា | | |
| 43 | `dashboard.charts.attendance.sparkLabel` | និន្នាការវត្តមាននៃថ្ងៃដែលបានកត់ត្រាចុងក្រោយ | | |
| 44 | `dashboard.charts.fill.title` | ចំនួនសិស្សក្នុងថ្នាក់ ធៀបនឹងចំណុះ | | |
| 45 | `dashboard.charts.fill.summary` | {classes} ថ្នាក់ មានសិស្ស {students} នាក់ · ថ្នាក់លើសចំណុះ {over} · ថ្នាក់មិនមានចំណុះកំណត់ {noCapacity}។ | | |
| 46 | `dashboard.charts.fill.note` | ចំណុះគឺជាចំនួនដែលបានកំណត់សម្រាប់ថ្នាក់នីមួយៗ (នៅទំព័រថ្នាក់)។ បន្ទាត់ដាច់ៗ = ចំណុះ។ ពណ៌ក្រហម = លើសចំណុះ។ | | |
| 47 | `dashboard.charts.fill.students` | សិស្ស | | |
| 48 | `dashboard.charts.fill.capacity` | ចំណុះ | | |
| 49 | `dashboard.charts.fill.noCapacity` | {n} នាក់ (មិនមានចំណុះកំណត់) | | |
| 50 | `dashboard.charts.fill.within` | {n} នាក់ ក្នុងចំណុះ {capacity} | | |
| 51 | `dashboard.charts.fill.over` | {n} នាក់ លើសចំណុះ {capacity} | | |
| 52 | `dashboard.charts.fill.empty` | មិនទាន់មានថ្នាក់ក្នុងឆ្នាំសិក្សានេះទេ។ | | |
| 53 | `dashboard.charts.exam.title` | ការប្រឡងថ្មីបំផុត | | |
| 54 | `dashboard.charts.exam.titleNamed` | ការប្រឡងថ្មីបំផុត៖ {name} | | |
| 55 | `dashboard.charts.exam.unofficial` | ពិន្ទុជាប់ និងនិទ្ទេសជាតម្លៃបណ្តោះអាសន្ន មិនមែនជាច្បាប់ផ្លូវការរបស់សាលាទេ។ | | |
| 56 | `dashboard.charts.exam.averageTitle` | ភាគរយមធ្យមតាមថ្នាក់ (ពិន្ទុជាប់ {pass}%) | | |
| 57 | `dashboard.charts.exam.resultsTitle` | លទ្ធផលរបស់សិស្ស | | |
| 58 | `dashboard.charts.exam.average` | មធ្យមភាគ | | |
| 59 | `dashboard.charts.exam.passed` | ជាប់ | | |
| 60 | `dashboard.charts.exam.failed` | ធ្លាក់ | | |
| 61 | `dashboard.charts.exam.incomplete` | មិនទាន់គ្រប់ពិន្ទុ | | |
| 62 | `dashboard.charts.exam.complete` | គ្រប់ពិន្ទុ | | |
| 63 | `dashboard.charts.exam.class` | {average}% · ជាប់ {passed} · ធ្លាក់ {failed} · មិនទាន់គ្រប់ពិន្ទុ {incomplete} | | |
| 64 | `dashboard.charts.exam.noneComplete` | មិនទាន់មានសិស្សណាគ្រប់ពិន្ទុទេ (សិស្ស {students} នាក់) | | |
| 65 | `dashboard.charts.exam.summary` | {name}៖ {classes} ថ្នាក់ · ជាប់ {passed} · ធ្លាក់ {failed} · មិនទាន់គ្រប់ពិន្ទុ {incomplete} · ពិន្ទុជាប់ {pass}%។ តួលេខដូចគ្នានឹងសន្លឹកពិន្ទុ។ | | |
| 66 | `dashboard.charts.exam.empty` | មិនទាន់មានការប្រឡងដែលមានពិន្ទុ ក្នុងឆ្នាំសិក្សានេះទេ។ | | |
| 67 | `dashboard.charts.fees.title` | ថ្លៃសិក្សាដែលបានទទួល ៦ ខែចុងក្រោយ | | |
| 68 | `dashboard.charts.fees.summary` | ចំនួនទឹកប្រាក់ដែលបានទទួលក្នុងមួយខែ បំបែកតាមរូបិយប័ណ្ណនីមួយៗ។ រៀល និងដុល្លារមិនត្រូវបានបូកបញ្ចូលគ្នា ឬបម្លែងឡើយ។ | | |
| 69 | `dashboard.charts.fees.collected` | បានទទួល | | |
| 70 | `dashboard.charts.fees.total` | សរុប ៦ ខែ៖ {amount} | | |
| 71 | `dashboard.charts.fees.month` | បានទទួល {amount} | | |
| 72 | `dashboard.charts.fees.empty` | មិនមានការបង់ប្រាក់ក្នុង ៦ ខែចុងក្រោយទេ។ | | |
| 73 | `error.TIMETABLE_TEACHER_CLASH` | គ្រូនេះមានមេរៀននៅថ្នាក់ផ្សេងរួចហើយក្នុងម៉ោងនេះ | | |
| 74 | `error.TIMETABLE_DAY_IN_USE` | មិនអាចដកថ្ងៃនេះចេញបានទេ ព្រោះមានមេរៀនក្នុងថ្ងៃនេះ។ សូមដកមេរៀនចេញជាមុន។ | | |
| 75 | `error.TIMETABLE_SLOT_IN_USE` | ម៉ោងនេះមានមេរៀន ដូច្នេះមិនអាចលុប ឬប្តូរទៅជាម៉ោងសម្រាកបានទេ។ អ្នកអាចប្តូរឈ្មោះ ឬម៉ោងបាន។ | | |
| 76 | `error.TIMETABLE_YEAR_NOT_EMPTY` | ឆ្នាំនេះមានម៉ោងសិក្សា ឬមេរៀនរួចហើយ ដូច្នេះមិនអាចចម្លងចូលបានទេ។ | | |
| 77 | `error.TIMETABLE_NOTHING_TO_COPY` | ឆ្នាំដើមមិនមានម៉ោងសិក្សាសម្រាប់ចម្លងទេ។ | | |
| 78 | `validation.TIMETABLE_DAY_DISABLED` | ថ្ងៃនេះមិនមែនជាថ្ងៃសិក្សាទេ | | |
| 79 | `validation.TIMETABLE_YEAR_MISMATCH` | ម៉ោង ឬថ្នាក់នេះនៅក្នុងឆ្នាំសិក្សាផ្សេង | | |
| 80 | `validation.TIMETABLE_BREAK_SLOT` | ម៉ោងសម្រាកមិនអាចមានមេរៀនបានទេ | | |
| 81 | `validation.TIMETABLE_SLOT_OVERLAP` | ម៉ោងនេះត្រួតនឹងម៉ោងផ្សេងរបស់ឆ្នាំនេះ | | |
| 82 | `validation.TIMETABLE_TEACHER_CLASH` | គ្រូនេះមានមេរៀននៅថ្នាក់ផ្សេងរួចហើយក្នុងម៉ោងនេះ | | |
| 83 | `validation.TIMETABLE_DIFFERENT_GRADE` | ត្រូវជាថ្នាក់នៃកម្រិតតែមួយ | | |
| 84 | `validation.TIMETABLE_DAY_IN_USE` | មិនអាចដកថ្ងៃដែលមានមេរៀនចេញបានទេ | | |
| 85 | `reports.timetableClass.title` | កាលវិភាគថ្នាក់ | | |
| 86 | `reports.timetableClass.sheet` | កាលវិភាគថ្នាក់ | | |
| 87 | `reports.timetableTeacher.title` | កាលវិភាគគ្រូ | | |
| 88 | `reports.timetableTeacher.sheet` | កាលវិភាគគ្រូ | | |
| 89 | `reports.timetableStudent.title` | កាលវិភាគសិស្ស | | |
| 90 | `reports.timetableStudent.sheet` | កាលវិភាគសិស្ស | | |
| 91 | `audit.action.TIMETABLE_DAYS_CHANGED` | ប្តូរថ្ងៃសិក្សានៃកាលវិភាគ | | |
| 92 | `audit.action.TIMETABLE_SLOT_CREATED` | បន្ថែមម៉ោងសិក្សានៃកាលវិភាគ | | |
| 93 | `audit.action.TIMETABLE_SLOT_UPDATED` | កែម៉ោងសិក្សានៃកាលវិភាគ | | |
| 94 | `audit.action.TIMETABLE_SLOT_DELETED` | លុបម៉ោងសិក្សានៃកាលវិភាគ | | |
| 95 | `audit.action.TIMETABLE_LESSON_SET` | បន្ថែមមេរៀនក្នុងកាលវិភាគ | | |
| 96 | `audit.action.TIMETABLE_LESSON_CHANGED` | កែមេរៀនក្នុងកាលវិភាគ | | |
| 97 | `audit.action.TIMETABLE_LESSON_CLEARED` | ដកមេរៀនចេញពីកាលវិភាគ | | |
| 98 | `audit.action.TIMETABLE_CLASS_COPIED` | ចម្លងកាលវិភាគពីថ្នាក់ផ្សេង | | |
| 99 | `audit.action.TIMETABLE_YEAR_COPIED` | យកកាលវិភាគពីឆ្នាំសិក្សាផ្សេង | | |
| 100 | `audit.entity.timetable_slot` | ម៉ោងសិក្សានៃកាលវិភាគ | | |
| 101 | `audit.entity.timetable_entry` | មេរៀនក្នុងកាលវិភាគ | | |
| 102 | `acceptance.draft.timetableSlots` | ថ្ងៃ និងម៉ោងសិក្សានៃកាលវិភាគមិនទាន់បានបញ្ជាក់ពីសាលាទេ។ កម្មវិធីមិនបំពេញម៉ោងដោយខ្លួនឯងទេ សូមបញ្ចូលតាមកាលវិភាគពិតរបស់សាលា ហើយបញ្ជាក់។ | | |
| 103 | `acceptance.item.timetable-slots.title` | ថ្ងៃ និងម៉ោងនៃកាលវិភាគមេរៀន | | |
| 104 | `acceptance.item.timetable-slots.closes` | ថ្ងៃសិក្សា និងម៉ោងសិក្សាពិតរបស់សាលា ត្រូវបញ្ចូលក្នុងកម្មវិធី | | |
| 105 | `timetable.title` | កាលវិភាគប្រចាំសប្តាហ៍ | | |
| 106 | `timetable.subtitle` | កាលវិភាគមេរៀនតាមថ្នាក់ និងតាមគ្រូ។ កាលវិភាគរបស់សិស្សមួយរូប នៅក្នុងទំព័ររបស់សិស្សនោះ។ | | |
| 107 | `timetable.tabClass` | តាមថ្នាក់ | | |
| 108 | `timetable.tabTeacher` | តាមគ្រូ | | |
| 109 | `timetable.time` | ម៉ោង | | |
| 110 | `timetable.day.1` | ច័ន្ទ | | |
| 111 | `timetable.day.2` | អង្គារ | | |
| 112 | `timetable.day.3` | ពុធ | | |
| 113 | `timetable.day.4` | ព្រហស្បតិ៍ | | |
| 114 | `timetable.day.5` | សុក្រ | | |
| 115 | `timetable.day.6` | សៅរ៍ | | |
| 116 | `timetable.day.7` | អាទិត្យ | | |
| 117 | `timetable.day.label` | ថ្ងៃ | | |
| 118 | `timetable.showAllSlots` | បង្ហាញម៉ោងទាំងអស់ (រួមទាំងម៉ោងដែលថ្នាក់នេះមិនប្រើ) | | |
| 119 | `timetable.addLesson` | បន្ថែមមេរៀន ថ្ងៃ{day} {slot} | | |
| 120 | `timetable.changeLesson` | កែមេរៀន ថ្ងៃ{day} {slot} | | |
| 121 | `timetable.teacherInactive` | គ្រូឈប់បង្រៀន | | |
| 122 | `timetable.lessonsInWeek` | {n} មេរៀនក្នុងមួយសប្តាហ៍ | | |
| 123 | `timetable.teacherLessons` | {n} មេរៀនក្នុងមួយសប្តាហ៍ | | |
| 124 | `timetable.yearClosed` | ឆ្នាំសិក្សានេះបានបិទ ដូច្នេះអាចមើលបាន តែមិនអាចកែប្រែកាលវិភាគបានទេ។ | | |
| 125 | `timetable.unconfiguredTitle` | មិនទាន់មានម៉ោងសិក្សាទេ | | |
| 126 | `timetable.unconfiguredText` | សាលាមិនទាន់បានបញ្ចូលម៉ោងសិក្សារបស់ឆ្នាំនេះទេ។ កម្មវិធីមិនបំពេញម៉ោងដោយខ្លួនឯងឡើយ។ សូមបញ្ចូលម៉ោងពិតរបស់សាលានៅក្នុងការកំណត់កាលវិភាគ។ | | |
| 127 | `timetable.classEmpty` | ថ្នាក់នេះមិនទាន់មានកាលវិភាគទេ។ ចុចលើប្រអប់មួយ ដើម្បីបន្ថែមមេរៀន។ | | |
| 128 | `timetable.classEmptyClosed` | ថ្នាក់នេះមិនមានកាលវិភាគទេ។ | | |
| 129 | `timetable.teacherEmpty` | គ្រូនេះមិនទាន់មានមេរៀនក្នុងឆ្នាំនេះទេ។ | | |
| 130 | `timetable.pickTeacher` | ជ្រើសរើសគ្រូ | | |
| 131 | `timetable.pickTeacherHint` | សូមជ្រើសរើសគ្រូ ដើម្បីមើលកាលវិភាគរបស់គាត់។ | | |
| 132 | `timetable.studentNotEnrolled` | សិស្សនេះមិនមានថ្នាក់ក្នុងឆ្នាំសិក្សា {year} ទេ ដូច្នេះមិនមានកាលវិភាគទេ។ | | |
| 133 | `timetable.notEnrolledShort` | មិនទាន់មានថ្នាក់ | | |
| 134 | `timetable.openFull` | មើលកាលវិភាគពេញ | | |
| 135 | `timetable.clash` | គ្រូនេះមានមេរៀននៅថ្នាក់ {className} រួចហើយ ថ្ងៃ{day} {slot}។ | | |
| 136 | `timetable.print.landscape` | បោះពុម្ពតាមទទឹង (A4 ផ្តេក) | | |
| 137 | `timetable.cell.title` | ថ្ងៃ{day} · {slot} ({times}) | | |
| 138 | `timetable.cell.titleShort` | មេរៀន | | |
| 139 | `timetable.cell.subject` | មុខវិជ្ជា | | |
| 140 | `timetable.cell.chooseSubject` | — ជ្រើសរើសមុខវិជ្ជា — | | |
| 141 | `timetable.cell.noSubjects` | ថ្នាក់នេះមិនទាន់មានមុខវិជ្ជាទេ។ សូមកំណត់មុខវិជ្ជារបស់ថ្នាក់ទីនេះក្នុងការកំណត់ឆ្នាំសិក្សា និងមុខវិជ្ជា។ | | |
| 142 | `timetable.cell.teacher` | គ្រូ | | |
| 143 | `timetable.cell.chooseTeacher` | — ជ្រើសរើសគ្រូ — | | |
| 144 | `timetable.cell.notAssigned` | មិនប្រចាំថ្នាក់នេះ | | |
| 145 | `timetable.cell.showAllTeachers` | បង្ហាញគ្រូដែលកំពុងបង្រៀនទាំងអស់ | | |
| 146 | `timetable.cell.bothRequired` | ត្រូវជ្រើសរើសទាំងមុខវិជ្ជា និងគ្រូ ទើបអាចរក្សាទុកបាន។ | | |
| 147 | `timetable.cell.clear` | ដកមេរៀនចេញ | | |
| 148 | `timetable.cell.saved` | បានរក្សាទុកមេរៀន | | |
| 149 | `timetable.cell.cleared` | បានដកមេរៀនចេញ | | |
| 150 | `timetable.copy.fromClass` | ចម្លងពីថ្នាក់ផ្សេង | | |
| 151 | `timetable.copy.classTitle` | ចម្លងកាលវិភាគពីថ្នាក់ផ្សេង | | |
| 152 | `timetable.copy.classIntro` | ចម្លងកាលវិភាគរបស់ថ្នាក់មួយ (កម្រិត និងឆ្នាំដូចគ្នា) មកថ្នាក់នេះ។ គ្រូនៃមេរៀនដែលបានចម្លង គឺជាគ្រូប្រចាំមុខវិជ្ជារបស់ថ្នាក់នេះ មិនមែនគ្រូរបស់ថ្នាក់ដើមទេ។ ត្រូវមើលជាមុនសិន ទើបចម្លងបាន។ | | |
| 153 | `timetable.copy.source` | ចម្លងពីថ្នាក់ | | |
| 154 | `timetable.copy.replace` | ជំនួសមេរៀនដែលមានស្រាប់ក្នុងថ្នាក់នេះ (បើមិនធីកទេ នឹងបំពេញតែប្រអប់ទំនេរ) | | |
| 155 | `timetable.copy.noOtherClass` | មិនមានថ្នាក់ផ្សេងដែលមានកម្រិត និងឆ្នាំដូចគ្នាទេ។ | | |
| 156 | `timetable.copy.preview` | មើលជាមុន | | |
| 157 | `timetable.copy.go` | ចម្លង | | |
| 158 | `timetable.copy.done` | បានចម្លងកាលវិភាគ | | |
| 159 | `timetable.copy.previewSummary` | ការមើលជាមុន៖ នឹងចម្លង {copied} មេរៀន ហើយរំលង {skipped} មេរៀន។ មិនទាន់មានអ្វីត្រូវបានផ្លាស់ប្តូរទេ។ | | |
| 160 | `timetable.copy.doneSummary` | បានចម្លង {copied} មេរៀន ហើយរំលង {skipped} មេរៀន។ | | |
| 161 | `timetable.copy.slots` | នឹងចម្លងម៉ោងសិក្សា {n} | | |
| 162 | `timetable.copy.replaced` | នឹងលុបមេរៀនដែលមានស្រាប់ក្នុងថ្នាក់នេះ {n} | | |
| 163 | `timetable.copy.copiedTitle` | មេរៀនដែលចម្លង | | |
| 164 | `timetable.copy.skippedTitle` | មេរៀនដែលរំលង និងមូលហេតុ | | |
| 165 | `timetable.copy.reason` | មូលហេតុ | | |
| 166 | `timetable.copy.yearTitle` | យកកាលវិភាគពីឆ្នាំសិក្សាមុន | | |
| 167 | `timetable.copy.yearHint` | ឆ្នាំនេះមិនទាន់មានម៉ោងសិក្សាទេ។ អ្នកអាចយកថ្ងៃសិក្សា ម៉ោងសិក្សា និងមេរៀនរបស់ថ្នាក់ដែលមានទាំងពីរឆ្នាំ (កម្រិត និងឈ្មោះដូចគ្នា) ពីឆ្នាំមួយទៀតមក។ ឆ្នាំដើមមិនត្រូវបានកែប្រែឡើយ។ ត្រូវមើលជាមុនសិន ទើបចម្លងបាន។ | | |
| 168 | `timetable.copy.fromYear` | ជ្រើសរើសឆ្នាំដើម | | |
| 169 | `timetable.copy.nothingToCopy` | ឆ្នាំដែលបានជ្រើសរើសមិនមានម៉ោងសិក្សាសម្រាប់ចម្លងទេ។ | | |
| 170 | `timetable.skip.SUBJECT_NOT_OFFERED` | ថ្នាក់នេះមិនរៀនមុខវិជ្ជានេះទេ | | |
| 171 | `timetable.skip.NO_TEACHER_ASSIGNED` | ថ្នាក់នេះមិនទាន់មានគ្រូប្រចាំមុខវិជ្ជានេះ | | |
| 172 | `timetable.skip.TEACHER_INACTIVE` | គ្រូប្រចាំមុខវិជ្ជានេះបានឈប់បង្រៀន | | |
| 173 | `timetable.skip.TEACHER_CLASH` | គ្រូមានមេរៀននៅថ្នាក់ {detail} រួចហើយក្នុងម៉ោងនេះ | | |
| 174 | `timetable.skip.CELL_OCCUPIED` | ប្រអប់នេះមានមេរៀនរួចហើយ | | |
| 175 | `timetable.skip.DAY_DISABLED` | ថ្ងៃនេះមិនមែនជាថ្ងៃសិក្សាទេ | | |
| 176 | `timetable.skip.CLASS_NOT_IN_YEAR` | ឆ្នាំនេះមិនមានថ្នាក់ដែលមានកម្រិត និងឈ្មោះដូចគ្នា | | |
| 177 | `timetable.settings.title` | ម៉ោង និងថ្ងៃសិក្សា | | |
| 178 | `timetable.settings.subtitle` | ថ្ងៃសិក្សា និងម៉ោងសិក្សានៃឆ្នាំសិក្សានីមួយៗ ដែលសាលាកំណត់ខ្លួនឯង | | |
| 179 | `timetable.settings.intro` | កម្មវិធីមិនបំពេញម៉ោង ឬថ្ងៃដោយខ្លួនឯងទេ សូមបញ្ចូលតាមកាលវិភាគពិតរបស់សាលា។ ម៉ោងនីមួយៗមិនត្រូវត្រួតគ្នាទេ។ | | |
| 180 | `timetable.settings.yearClosed` | ឆ្នាំសិក្សានេះបានបិទ ដូច្នេះមិនអាចកែប្រែបានទេ។ | | |
| 181 | `timetable.settings.daysTitle` | ថ្ងៃសិក្សា | | |
| 182 | `timetable.settings.daysDefault` | ឆ្នាំនេះមិនទាន់បានជ្រើសរើសថ្ងៃទេ។ ថ្ងៃច័ន្ទដល់ថ្ងៃសុក្រ ជាជម្រើសចាប់ផ្តើមរបស់កម្មវិធី ហើយមិនទាន់ត្រូវបានរក្សាទុកទេ។ | | |
| 183 | `timetable.settings.daysChosen` | ថ្ងៃសិក្សាដែលសាលាបានជ្រើសរើស។ មិនអាចដកថ្ងៃដែលមានមេរៀនចេញបានទេ។ | | |
| 184 | `timetable.settings.saveDays` | រក្សាទុកថ្ងៃសិក្សា | | |
| 185 | `timetable.settings.daysSaved` | បានរក្សាទុកថ្ងៃសិក្សា | | |
| 186 | `timetable.settings.slotsTitle` | ម៉ោងសិក្សា | | |
| 187 | `timetable.settings.emptyTitle` | មិនទាន់មានម៉ោងសិក្សាទេ | | |
| 188 | `timetable.settings.emptyText` | សាលាមិនទាន់បានបញ្ចូលម៉ោងសិក្សារបស់ឆ្នាំនេះទេ។ កម្មវិធីមិនបំពេញម៉ោងដោយខ្លួនឯងឡើយ។ សូមបន្ថែមម៉ោងតាមកាលវិភាគពិតរបស់សាលា។ | | |
| 189 | `timetable.settings.slotName` | ឈ្មោះម៉ោង | | |
| 190 | `timetable.settings.times` | ម៉ោង | | |
| 191 | `timetable.settings.kind` | ប្រភេទ | | |
| 192 | `timetable.settings.lesson` | ម៉ោងរៀន | | |
| 193 | `timetable.settings.break` | ម៉ោងសម្រាក | | |
| 194 | `timetable.settings.lessons` | មេរៀន | | |
| 195 | `timetable.settings.delete` | លុប | | |
| 196 | `timetable.settings.inUse` | មិនអាចលុបម៉ោងនេះបានទេ ព្រោះមានមេរៀនក្នុងម៉ោងនេះ។ អ្នកអាចប្តូរឈ្មោះ ឬម៉ោងបាន។ | | |
| 197 | `timetable.settings.inUseShort` | មានមេរៀន | | |
| 198 | `timetable.settings.keepsLessons` | ម៉ោងដែលមានមេរៀនអាចប្តូរឈ្មោះ ឬម៉ោងបាន ប៉ុន្តែមិនអាចលុបបានទេ។ | | |
| 199 | `timetable.settings.add` | បន្ថែមម៉ោង | | |
| 200 | `timetable.settings.addTitle` | បន្ថែមម៉ោងសិក្សា | | |
| 201 | `timetable.settings.editTitle` | កែម៉ោងសិក្សា | | |
| 202 | `timetable.settings.nameHint` | ឈ្មោះដែលសាលាប្រើ (ឧទាហរណ៍ ម៉ោងទី១ ឬ ម៉ោងសម្រាក) | | |
| 203 | `timetable.settings.isBreak` | នេះជាម៉ោងសម្រាក (មិនមានមេរៀនទេ) | | |
| 204 | `timetable.settings.timesHint` | វាយជាទម្រង់ ម៉ោង:នាទី ២៤ ម៉ោង។ ម៉ោងបញ្ចប់ត្រូវនៅក្រោយម៉ោងចាប់ផ្តើម ហើយមិនត្រួតនឹងម៉ោងផ្សេង។ | | |
| 205 | `timetable.settings.slotCreated` | បានបន្ថែមម៉ោងសិក្សា | | |
| 206 | `timetable.settings.slotUpdated` | បានកែម៉ោងសិក្សា | | |
| 207 | `timetable.settings.slotDeleted` | បានលុបម៉ោងសិក្សា | | |
| 208 | `timetable.settings.reloaded` | ព័ត៌មានបានផ្លាស់ប្តូរ។ បានផ្ទុកឡើងវិញ សូមព្យាយាមម្តងទៀត។ | | |
| 209 | `timetable.settings.deleteTitle` | លុបម៉ោងសិក្សា? | | |
| 210 | `timetable.settings.deleteMessage` | លុបម៉ោង «{name}»? ម៉ោងនេះមិនមានមេរៀនទេ។ | | |
