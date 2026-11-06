-- V8: subjects with sub-subjects (stage 1 of docs/PHASE0-ARCHITECTURE.md section 16, approved by the owner on 2026-11-05).
-- Additive only: nothing is dropped or rebuilt, every existing row keeps its id, and no existing examination, score or report card changes.
-- A main subject has parent_id NULL; a sub-subject points at its main subject. Two levels only.

-- ---- the catalogue ------------------------------------------------------------------------------------------------
ALTER TABLE subjects ADD COLUMN parent_id INTEGER REFERENCES subjects (id);
CREATE INDEX idx_subjects_parent ON subjects (parent_id);

-- Two levels only, and a sub-subject's parent must be a main subject. SQLite cannot CHECK another row, so two triggers keep it true even if a
-- statement bypasses the service (the service validates first: Spring does not classify SQLite's own errors).
CREATE TRIGGER trg_subjects_parent_insert BEFORE INSERT ON subjects
WHEN NEW.parent_id IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'SUBJECT_PARENT_INVALID')
    WHERE NOT EXISTS (SELECT 1 FROM subjects p WHERE p.id = NEW.parent_id AND p.parent_id IS NULL);
END;

CREATE TRIGGER trg_subjects_parent_update BEFORE UPDATE OF parent_id ON subjects
WHEN NEW.parent_id IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'SUBJECT_PARENT_INVALID')
    WHERE NEW.parent_id = NEW.id
       OR NOT EXISTS (SELECT 1 FROM subjects p WHERE p.id = NEW.parent_id AND p.parent_id IS NULL)
       OR EXISTS (SELECT 1 FROM subjects c WHERE c.parent_id = NEW.id);
END;

-- ---- an examination keeps its own copy of what it was set up with ---------------------------------------------------
-- name_km and sort_order are what the examination showed when it was created: results and report cards read these, never the live catalogue, so
-- renaming or re-ordering a subject later cannot change an old examination. Nullable only because SQLite cannot add NOT NULL without a default:
-- the back-fill below fills every existing row and the service always writes them (a test asserts none is NULL).
ALTER TABLE examination_subjects ADD COLUMN name_km TEXT;
ALTER TABLE examination_subjects ADD COLUMN sort_order INTEGER;
-- How this row's score comes about. DIRECT = typed here (everything before V8). SUB_SUBJECTS = the sum of its sub-subject rows (read-only).
-- COMPONENTS is reserved for the quiz components of a later migration, so that migration needs no table rebuild.
ALTER TABLE examination_subjects ADD COLUMN score_source TEXT NOT NULL DEFAULT 'DIRECT' CHECK (score_source IN ('DIRECT', 'SUB_SUBJECTS', 'COMPONENTS'));
-- How a main subject's sub-subjects are combined. Only SUM is accepted by the service until the school confirms another rule (WEIGHTED_PERCENT is reserved).
ALTER TABLE examination_subjects ADD COLUMN combine_policy TEXT NOT NULL DEFAULT 'SUM' CHECK (combine_policy IN ('SUM', 'WEIGHTED_PERCENT'));
-- Set in the same statement that freezes the grading scale: when the first score of any kind is stored the subject structure is frozen too.
ALTER TABLE examinations ADD COLUMN structure_frozen_at TEXT;

-- The sub-subject rows of an examination. A table of its own on purpose: every existing query on examination_subjects keeps meaning "the main
-- subjects of the examination", so a sub-subject can never be counted on top of its main subject.
CREATE TABLE examination_sub_subjects (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_subject_id  INTEGER NOT NULL REFERENCES examination_subjects (id),
    subject_id              INTEGER NOT NULL REFERENCES subjects (id),
    name_km                 TEXT    NOT NULL,
    sort_order              INTEGER NOT NULL,
    max_score_x100          INTEGER NOT NULL CHECK (max_score_x100 > 0),
    score_source            TEXT    NOT NULL DEFAULT 'DIRECT' CHECK (score_source IN ('DIRECT', 'COMPONENTS')),
    created_at              TEXT    NOT NULL,
    UNIQUE (examination_subject_id, subject_id)
);

-- Same shape and rules as student_scores: NULL = not entered yet, is_absent = did not sit it (a score of 0 is a different thing).
CREATE TABLE sub_subject_scores (
    id                           INTEGER PRIMARY KEY AUTOINCREMENT,
    examination_sub_subject_id   INTEGER NOT NULL REFERENCES examination_sub_subjects (id),
    enrollment_id                INTEGER NOT NULL REFERENCES enrollments (id),
    score_x100                   INTEGER CHECK (score_x100 IS NULL OR score_x100 >= 0),
    is_absent                    INTEGER NOT NULL DEFAULT 0 CHECK (is_absent IN (0, 1)),
    remark                       TEXT,
    created_at                   TEXT    NOT NULL,
    updated_at                   TEXT    NOT NULL,
    UNIQUE (examination_sub_subject_id, enrollment_id),
    CHECK (NOT (is_absent = 1 AND score_x100 IS NOT NULL))
);

CREATE INDEX idx_sub_subject_scores_enrollment ON sub_subject_scores (enrollment_id);

-- ---- back-fill (the way V5 did it for the grading scale): what an old examination shows today is what it keeps -----------
UPDATE examination_subjects
SET name_km    = (SELECT s.name_km    FROM subjects s WHERE s.id = examination_subjects.subject_id),
    sort_order = (SELECT s.sort_order FROM subjects s WHERE s.id = examination_subjects.subject_id);

UPDATE examinations
SET structure_frozen_at = (SELECT min(sc.created_at) FROM student_scores sc JOIN examination_subjects es ON es.id = sc.examination_subject_id WHERE es.examination_id = examinations.id)
WHERE EXISTS (SELECT 1 FROM student_scores sc JOIN examination_subjects es ON es.id = sc.examination_subject_id WHERE es.examination_id = examinations.id);
