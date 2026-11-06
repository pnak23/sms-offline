-- V9: homework marks. Homework becomes an independent module: an assignment may have a maximum mark, and every student of the class may have a record for it
-- (a submission status, a mark and a remark). ADDITIVE ONLY: one new column and one new table; no table is rebuilt and no existing row changes, so every homework
-- that exists today stays exactly what it is (a record without marks: max_score_x100 stays NULL).
--
-- Homework marks are NEVER part of an examination: nothing here touches examinations, examination_subjects, student_scores or sub_subject_scores, and no result,
-- rank, report card or dashboard figure reads these tables (a backend test keeps it that way).
--
-- Marks are whole hundredths, as everywhere else (7.25 is 725). A blank mark is "not entered", never 0.

-- NULL = a homework without marks (the record-only kind); a number = the maximum mark, always above zero.
ALTER TABLE homework ADD COLUMN max_score_x100 INTEGER CHECK (max_score_x100 IS NULL OR max_score_x100 > 0);

-- One row per student (an enrollment: the student in that class) and assignment, only while there is something to keep. A row with no status, no mark and no remark
-- is deleted by the service instead of being stored. The status is chosen by the teacher: the program never works it out from the clock.
CREATE TABLE homework_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    homework_id    INTEGER NOT NULL REFERENCES homework (id),
    enrollment_id  INTEGER NOT NULL REFERENCES enrollments (id),
    status         TEXT    CHECK (status IS NULL OR status IN ('SUBMITTED', 'LATE', 'NOT_SUBMITTED', 'EXCUSED')),
    score_x100     INTEGER CHECK (score_x100 IS NULL OR score_x100 >= 0),
    remark         TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL,
    UNIQUE (homework_id, enrollment_id),
    -- a mark belongs to a piece of work that was handed in (written so that a missing status fails it: a NULL inside a CHECK would pass)
    CHECK (score_x100 IS NULL OR (status IS NOT NULL AND status IN ('SUBMITTED', 'LATE'))),
    CHECK (status IS NOT NULL OR score_x100 IS NOT NULL OR remark IS NOT NULL)
);

CREATE INDEX idx_homework_records_enrollment ON homework_records (enrollment_id);
