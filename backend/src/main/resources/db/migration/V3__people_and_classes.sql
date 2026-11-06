-- V3: Phase 2 (core school management). Built up sub-step by sub-step and RELEASED ONLY WHEN PHASE 2 IS FINISHED, so
-- until then this file may still grow; a developer database created from a half-finished V3 must be recreated
-- (node scripts/dev-backend.mjs --fresh). Once a release contains V3 it is never edited again.
--
-- 2a: which subjects each grade studies.

CREATE TABLE grade_subjects (
    grade_id    INTEGER NOT NULL REFERENCES grades (id),
    subject_id  INTEGER NOT NULL REFERENCES subjects (id),
    created_at  TEXT    NOT NULL,
    PRIMARY KEY (grade_id, subject_id)
);

CREATE INDEX idx_grade_subjects_subject ON grade_subjects (subject_id);

-- Starting point: every active subject is studied in every grade; the Settings page narrows it down.
INSERT INTO grade_subjects (grade_id, subject_id, created_at)
SELECT g.id, s.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM grades g CROSS JOIN subjects s
WHERE s.is_active = 1;

-- 2b: teachers. Teachers are deactivated, never deleted (classes and later records may refer to them).
CREATE TABLE teachers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_code     TEXT    NOT NULL UNIQUE,
    name_km          TEXT    NOT NULL,
    gender           TEXT    NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
    phone            TEXT,
    address          TEXT,
    specialization   TEXT,
    employment_date  TEXT,
    status           TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version          INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

CREATE INDEX idx_teachers_name   ON teachers (name_km);
CREATE INDEX idx_teachers_status ON teachers (status);

-- 2c: classes (one per academic year + grade + name) and who teaches which subject in them.
-- shift is unused until the school says it runs morning/afternoon classes (it is never shown until then).
CREATE TABLE classes (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year_id     INTEGER NOT NULL REFERENCES academic_years (id),
    grade_id             INTEGER NOT NULL REFERENCES grades (id),
    name_km              TEXT    NOT NULL,
    capacity             INTEGER NOT NULL DEFAULT 40 CHECK (capacity BETWEEN 1 AND 200),
    homeroom_teacher_id  INTEGER REFERENCES teachers (id),
    shift                TEXT    CHECK (shift IS NULL OR shift IN ('MORNING', 'AFTERNOON')),
    version              INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL,
    UNIQUE (academic_year_id, grade_id, name_km)
);

CREATE INDEX idx_classes_year     ON classes (academic_year_id);
CREATE INDEX idx_classes_homeroom ON classes (homeroom_teacher_id);

CREATE TABLE teacher_assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id    INTEGER NOT NULL REFERENCES classes (id),
    subject_id  INTEGER NOT NULL REFERENCES subjects (id),
    teacher_id  INTEGER NOT NULL REFERENCES teachers (id),
    created_at  TEXT    NOT NULL,
    UNIQUE (class_id, subject_id)
);

CREATE INDEX idx_teacher_assignments_teacher ON teacher_assignments (teacher_id);

-- 2d: students and their guardians. A student with history is deactivated, never deleted (foreign keys enforce it).
CREATE TABLE students (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    student_code     TEXT    NOT NULL UNIQUE,
    name_km          TEXT    NOT NULL,
    name_en          TEXT,
    gender           TEXT    NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
    date_of_birth    TEXT    NOT NULL,
    place_of_birth   TEXT,
    address          TEXT,
    village          TEXT,
    commune          TEXT,
    district         TEXT,
    province         TEXT,
    enrollment_date  TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'GRADUATED')),
    photo_file       TEXT,
    notes            TEXT,
    version          INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

CREATE INDEX idx_students_name   ON students (name_km);
CREATE INDEX idx_students_status ON students (status);
CREATE INDEX idx_students_birth  ON students (name_km, date_of_birth);

CREATE TABLE guardians (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    INTEGER NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    name_km       TEXT    NOT NULL,
    relationship  TEXT    NOT NULL CHECK (relationship IN ('FATHER', 'MOTHER', 'GRANDPARENT', 'SIBLING', 'UNCLE_AUNT', 'OTHER')),
    phone         TEXT,
    is_primary    INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    created_at    TEXT    NOT NULL
);

CREATE INDEX idx_guardians_student ON guardians (student_id);
CREATE INDEX idx_guardians_phone   ON guardians (phone);
-- at most one primary guardian per student
CREATE UNIQUE INDEX uq_guardians_primary ON guardians (student_id) WHERE is_primary = 1;

-- 2d/2e: a student's place in a class for one academic year. History hangs off the enrollment, not the student.
-- ACTIVE = in this class now; PROMOTED / REPEATED / GRADUATED = the year ended with that outcome;
-- CHANGED_CLASS = moved to another class of the same year; LEFT = left the school during the year.
CREATE TABLE enrollments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id        INTEGER NOT NULL REFERENCES students (id),
    academic_year_id  INTEGER NOT NULL REFERENCES academic_years (id),
    class_id          INTEGER NOT NULL REFERENCES classes (id),
    status            TEXT    NOT NULL DEFAULT 'ACTIVE'
                              CHECK (status IN ('ACTIVE', 'PROMOTED', 'REPEATED', 'GRADUATED', 'CHANGED_CLASS', 'LEFT')),
    enrolled_on       TEXT    NOT NULL,
    left_on           TEXT,
    end_reason        TEXT,
    version           INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
);

CREATE INDEX idx_enrollments_class   ON enrollments (class_id);
CREATE INDEX idx_enrollments_student ON enrollments (student_id);
-- a student has at most one ACTIVE enrollment per academic year (also makes promotion safe to repeat)
CREATE UNIQUE INDEX uq_enrollments_active ON enrollments (student_id, academic_year_id) WHERE status = 'ACTIVE';
