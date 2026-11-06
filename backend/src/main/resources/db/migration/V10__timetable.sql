-- V10: the weekly timetable (docs/TIMETABLE-PLAN.md). ADDITIVE ONLY: three new tables, three indexes and three triggers. No existing table is changed, rebuilt or
-- back-filled, and NO ROW IS CREATED: every school starts with an empty timetable. The school days, the time slots and the lessons are typed by the school; the program
-- invents no time, no day and no grade arrangement. (The default school week, Monday to Friday, is a rule of the program: it is used while a year has no
-- timetable_days rows, and nothing is written for it.)
--
-- The timetable is independent of attendance, examinations, homework and fees: nothing here is read by a result, a rank, a report card or an attendance figure.

-- The school days of an academic year. A row = a day on which the year has lessons (1 = Monday ... 7 = Sunday). NO ROWS AT ALL means "the default Monday to Friday".
CREATE TABLE timetable_days (
    academic_year_id INTEGER NOT NULL REFERENCES academic_years (id),
    day_of_week      INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    PRIMARY KEY (academic_year_id, day_of_week)
);

-- The time slots of an academic year, as the school defines them. A break (is_break = 1) is a shaded row that never holds a lesson. Slots of a year are listed by
-- start time and never overlap (the service refuses an overlap), so "a teacher is in one place at a time" is a plain unique key below.
-- Times are "HH:mm" (the service validates fully; the CHECK is the last line: hours 00-23, minutes 00-59).
CREATE TABLE timetable_slots (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years (id),
    name_km          TEXT    NOT NULL,
    start_time       TEXT    NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) < '24'),
    end_time         TEXT    NOT NULL CHECK (end_time   GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) < '24'),
    is_break         INTEGER NOT NULL DEFAULT 0 CHECK (is_break IN (0, 1)),
    version          INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    UNIQUE (academic_year_id, name_km),
    CHECK (end_time > start_time)
);

-- One lesson: a class, a day, a slot, ONE subject and ONE teacher. A cell with only a subject or only a teacher cannot exist (both NOT NULL).
-- The lesson keeps its own teacher: changing who teaches the subject in the class later (teacher_assignments) does not rewrite a timetable.
CREATE TABLE timetable_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id    INTEGER NOT NULL REFERENCES classes (id),
    slot_id     INTEGER NOT NULL REFERENCES timetable_slots (id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    subject_id  INTEGER NOT NULL REFERENCES subjects (id),
    teacher_id  INTEGER NOT NULL REFERENCES teachers (id),
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE (class_id, slot_id, day_of_week),      -- a class has one lesson per slot per day
    UNIQUE (teacher_id, slot_id, day_of_week)     -- a teacher is in one place at a time
);

CREATE INDEX idx_timetable_entries_slot    ON timetable_entries (slot_id);
CREATE INDEX idx_timetable_entries_subject ON timetable_entries (subject_id);
CREATE INDEX idx_timetable_slots_year      ON timetable_slots (academic_year_id, start_time);

-- The database refuses what the service refuses, for any statement that bypasses the service (the service validates first: Spring does not classify SQLite's own errors).
-- A lesson's class and slot belong to the same academic year, its slot is not a break, and its subject is a MAIN subject.
CREATE TRIGGER trg_timetable_entries_insert BEFORE INSERT ON timetable_entries
BEGIN
    SELECT RAISE(ABORT, 'TIMETABLE_YEAR_MISMATCH')
    WHERE (SELECT academic_year_id FROM classes WHERE id = NEW.class_id) IS NOT (SELECT academic_year_id FROM timetable_slots WHERE id = NEW.slot_id);
    SELECT RAISE(ABORT, 'TIMETABLE_BREAK_SLOT')
    WHERE EXISTS (SELECT 1 FROM timetable_slots WHERE id = NEW.slot_id AND is_break = 1);
    SELECT RAISE(ABORT, 'TIMETABLE_SUBJECT_INVALID')
    WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND parent_id IS NULL);
END;

CREATE TRIGGER trg_timetable_entries_update BEFORE UPDATE OF class_id, slot_id, subject_id ON timetable_entries
BEGIN
    SELECT RAISE(ABORT, 'TIMETABLE_YEAR_MISMATCH')
    WHERE (SELECT academic_year_id FROM classes WHERE id = NEW.class_id) IS NOT (SELECT academic_year_id FROM timetable_slots WHERE id = NEW.slot_id);
    SELECT RAISE(ABORT, 'TIMETABLE_BREAK_SLOT')
    WHERE EXISTS (SELECT 1 FROM timetable_slots WHERE id = NEW.slot_id AND is_break = 1);
    SELECT RAISE(ABORT, 'TIMETABLE_SUBJECT_INVALID')
    WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND parent_id IS NULL);
END;

-- A slot that holds lessons cannot be turned into a break.
CREATE TRIGGER trg_timetable_slots_break BEFORE UPDATE OF is_break ON timetable_slots
WHEN NEW.is_break = 1
BEGIN
    SELECT RAISE(ABORT, 'TIMETABLE_SLOT_IN_USE')
    WHERE EXISTS (SELECT 1 FROM timetable_entries WHERE slot_id = NEW.id);
END;
