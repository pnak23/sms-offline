-- V4: Phase 3 (academic operations): attendance, grading scales, examinations and scores, report-card comments, homework.
-- Scores are stored x100 (7.25 -> 725) and weights x100 (1.00 -> 100); no floating point is ever stored.

-- ---- attendance ---------------------------------------------------------------------------------------------------
-- One session per class, day and shift. The shift is NOT NULL ('DAY' while the school has a single shift), because SQLite
-- treats NULLs as different in a UNIQUE constraint and a missing shift would let duplicate sessions through.
CREATE TABLE attendance_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id    INTEGER NOT NULL REFERENCES classes (id),
    date        TEXT    NOT NULL,
    shift       TEXT    NOT NULL DEFAULT 'DAY' CHECK (shift IN ('DAY', 'MORNING', 'AFTERNOON')),
    note        TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE (class_id, date, shift)
);

CREATE INDEX idx_attendance_sessions_date ON attendance_sessions (date);

CREATE TABLE attendance_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     INTEGER NOT NULL REFERENCES attendance_sessions (id),
    enrollment_id  INTEGER NOT NULL REFERENCES enrollments (id),
    status         TEXT    NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE')),
    remark         TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL,
    UNIQUE (session_id, enrollment_id)
);

CREATE INDEX idx_attendance_records_enrollment ON attendance_records (enrollment_id);

-- ---- grading scales -----------------------------------------------------------------------------------------------
CREATE TABLE grading_scales (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name_km            TEXT    NOT NULL,
    is_default         INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    pass_percent_x100  INTEGER NOT NULL DEFAULT 5000 CHECK (pass_percent_x100 BETWEEN 0 AND 10000),
    version            INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
);

-- at most one default scale
CREATE UNIQUE INDEX uq_grading_scales_default ON grading_scales (is_default) WHERE is_default = 1;

CREATE TABLE grading_scale_bands (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    scale_id          INTEGER NOT NULL REFERENCES grading_scales (id),
    min_percent_x100  INTEGER NOT NULL CHECK (min_percent_x100 BETWEEN 0 AND 10000),
    label_km          TEXT    NOT NULL,
    letter            TEXT    NOT NULL,
    sort_order        INTEGER NOT NULL,
    UNIQUE (scale_id, min_percent_x100)
);

-- A starting point only: the school's real scale replaces it (Settings -> Grading scale).
INSERT INTO grading_scales (name_km, is_default, pass_percent_x100, created_at, updated_at)
VALUES ('មាត្រដ្ឋានពិន្ទុលំនាំដើម', 1, 5000, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO grading_scale_bands (scale_id, min_percent_x100, label_km, letter, sort_order)
SELECT (SELECT id FROM grading_scales WHERE is_default = 1), v.min_percent, v.label, v.letter, v.sort_order
FROM (SELECT 9000 AS min_percent, 'ល្អប្រសើរ' AS label, 'A' AS letter, 1 AS sort_order
      UNION ALL SELECT 8000, 'ល្អណាស់', 'B', 2
      UNION ALL SELECT 7000, 'ល្អ', 'C', 3
      UNION ALL SELECT 6000, 'ល្អបង្គួរ', 'D', 4
      UNION ALL SELECT 5000, 'មធ្យម', 'E', 5
      UNION ALL SELECT 0, 'ខ្សោយ', 'F', 6) v;

-- ---- examinations -------------------------------------------------------------------------------------------------
CREATE TABLE examinations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year_id  INTEGER NOT NULL REFERENCES academic_years (id),
    name_km           TEXT    NOT NULL,
    kind              TEXT    NOT NULL CHECK (kind IN ('MONTHLY', 'MIDTERM', 'FINAL', 'OTHER')),
    term_no           INTEGER CHECK (term_no IS NULL OR term_no BETWEEN 1 AND 12),
    start_date        TEXT,
    end_date          TEXT,
    version           INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    UNIQUE (academic_year_id, name_km)
);

CREATE INDEX idx_examinations_year ON examinations (academic_year_id);

-- Which subjects an examination covers for each grade, with the maximum score and the weight of the subject.
CREATE TABLE examination_subjects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id  INTEGER NOT NULL REFERENCES examinations (id),
    grade_id        INTEGER NOT NULL REFERENCES grades (id),
    subject_id      INTEGER NOT NULL REFERENCES subjects (id),
    max_score_x100  INTEGER NOT NULL CHECK (max_score_x100 > 0),
    weight_x100     INTEGER NOT NULL DEFAULT 100 CHECK (weight_x100 > 0),
    created_at      TEXT    NOT NULL,
    UNIQUE (examination_id, grade_id, subject_id)
);

-- score_x100 NULL = not entered yet; is_absent = 1 = the student did not sit the exam (a score of 0 is a different thing).
CREATE TABLE student_scores (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_subject_id  INTEGER NOT NULL REFERENCES examination_subjects (id),
    enrollment_id           INTEGER NOT NULL REFERENCES enrollments (id),
    score_x100              INTEGER CHECK (score_x100 IS NULL OR score_x100 >= 0),
    is_absent               INTEGER NOT NULL DEFAULT 0 CHECK (is_absent IN (0, 1)),
    remark                  TEXT,
    created_at              TEXT    NOT NULL,
    updated_at              TEXT    NOT NULL,
    UNIQUE (examination_subject_id, enrollment_id),
    CHECK (NOT (is_absent = 1 AND score_x100 IS NOT NULL))
);

CREATE INDEX idx_student_scores_enrollment ON student_scores (enrollment_id);

-- The teacher's comment on a student's report card for one examination.
CREATE TABLE report_card_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_id  INTEGER NOT NULL REFERENCES examinations (id),
    enrollment_id   INTEGER NOT NULL REFERENCES enrollments (id),
    comment         TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE (examination_id, enrollment_id)
);

-- ---- homework (record-keeping only: no student submissions) ---------------------------------------------------------
CREATE TABLE homework (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id       INTEGER NOT NULL REFERENCES classes (id),
    subject_id     INTEGER NOT NULL REFERENCES subjects (id),
    title          TEXT    NOT NULL,
    description    TEXT,
    assigned_date  TEXT    NOT NULL,
    due_date       TEXT    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'DONE', 'CANCELLED')),
    remark         TEXT,
    version        INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL,
    CHECK (due_date >= assigned_date)
);

CREATE INDEX idx_homework_class ON homework (class_id, due_date);
