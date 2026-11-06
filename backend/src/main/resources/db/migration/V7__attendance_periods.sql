-- V7: flexible attendance sessions ("វគ្គវត្តមាន"). The school's timetable changes, so the sessions of a day are DATA the administrator keeps per
-- academic year, not three hard-coded shifts. In the database and the code a session of the day is an attendance PERIOD, because
-- attendance_sessions already means "one class's sheet for one day".
--
-- What this migration does, in order (Flyway runs it on a connection with foreign_keys OFF; the last step asserts nothing was orphaned):
--   1. attendance_periods: per academic year, a Khmer name, optional start/end times (information only, never enforced), an order,
--      enabled/disabled and "confirmed by the school" (an example time is never presented as the real timetable).
--   2. every existing academic year gets one period "ពេញមួយថ្ងៃ" (the whole day, no times). A year that already holds MORNING / AFTERNOON
--      sheets also gets "ពេលព្រឹក" / "ពេលរសៀល", so no history is lost and none is renamed. No time is invented.
--   3. attendance_sessions is rebuilt: the shift column goes, every sheet points at its period and keeps a SNAPSHOT of the period's name
--      and times as they were when it was first saved (later edits of the schedule never rewrite history). Sheet ids are kept.
--   4. attendance_records is rebuilt with student_id, date and period_id copied in, so the database itself refuses a second record
--      for the same student, date and period (it used to be refused only per class sheet). Record ids are kept.
--      If old data has such a duplicate (a student moved class and was marked in both on the same day), the most recently saved record
--      is kept and each one left out is written to the audit trail with its status, so nothing is dropped silently.

CREATE TABLE attendance_periods (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year_id  INTEGER NOT NULL REFERENCES academic_years (id),
    name_km           TEXT    NOT NULL,
    start_time        TEXT    CHECK (start_time IS NULL OR start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    end_time          TEXT    CHECK (end_time IS NULL OR end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    sort_order        INTEGER NOT NULL DEFAULT 0,
    enabled           INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    confirmed_at      TEXT,
    confirmed_by      TEXT,
    version           INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    UNIQUE (academic_year_id, name_km),
    CHECK ((start_time IS NULL) = (end_time IS NULL))
);

CREATE INDEX idx_attendance_periods_year ON attendance_periods (academic_year_id, sort_order);

INSERT INTO attendance_periods (academic_year_id, name_km, sort_order, created_at, updated_at)
SELECT y.id, 'ពេញមួយថ្ងៃ', 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM academic_years y;

INSERT INTO attendance_periods (academic_year_id, name_km, sort_order, created_at, updated_at)
SELECT DISTINCT c.academic_year_id, 'ពេលព្រឹក', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM attendance_sessions s JOIN classes c ON c.id = s.class_id WHERE s.shift = 'MORNING';

INSERT INTO attendance_periods (academic_year_id, name_km, sort_order, created_at, updated_at)
SELECT DISTINCT c.academic_year_id, 'ពេលរសៀល', 2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM attendance_sessions s JOIN classes c ON c.id = s.class_id WHERE s.shift = 'AFTERNOON';

-- ---- the class sheets of a day ------------------------------------------------------------------------------------------
CREATE TABLE attendance_sessions_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id        INTEGER NOT NULL REFERENCES classes (id),
    date            TEXT    NOT NULL,
    period_id       INTEGER NOT NULL REFERENCES attendance_periods (id),
    period_name_km  TEXT    NOT NULL,
    period_start    TEXT,
    period_end      TEXT,
    note            TEXT,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE (class_id, date, period_id)
);

INSERT INTO attendance_sessions_new (id, class_id, date, period_id, period_name_km, period_start, period_end, note, created_at, updated_at)
SELECT s.id, s.class_id, s.date, p.id, p.name_km, p.start_time, p.end_time, s.note, s.created_at, s.updated_at
FROM attendance_sessions s
JOIN classes c ON c.id = s.class_id
JOIN attendance_periods p ON p.academic_year_id = c.academic_year_id
     AND p.name_km = CASE s.shift WHEN 'MORNING' THEN 'ពេលព្រឹក' WHEN 'AFTERNOON' THEN 'ពេលរសៀល' ELSE 'ពេញមួយថ្ងៃ' END;

-- ---- one student, one day, one session ---------------------------------------------------------------------------------
CREATE TABLE attendance_records_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     INTEGER NOT NULL REFERENCES attendance_sessions (id),
    enrollment_id  INTEGER NOT NULL REFERENCES enrollments (id),
    student_id     INTEGER NOT NULL REFERENCES students (id),
    date           TEXT    NOT NULL,
    period_id      INTEGER NOT NULL REFERENCES attendance_periods (id),
    status         TEXT    NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE')),
    remark         TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL,
    UNIQUE (session_id, enrollment_id),
    UNIQUE (student_id, date, period_id)
);

CREATE TEMP TABLE _attendance_ranked AS
SELECT r.id AS record_id, r.session_id, r.enrollment_id, e.student_id, s.date, s.period_id, r.status, r.remark, r.created_at, r.updated_at,
       ROW_NUMBER() OVER (PARTITION BY e.student_id, s.date, s.period_id ORDER BY r.updated_at DESC, r.id DESC) AS rank_in_group
FROM attendance_records r
JOIN enrollments e ON e.id = r.enrollment_id
JOIN attendance_sessions_new s ON s.id = r.session_id;

INSERT INTO attendance_records_new (id, session_id, enrollment_id, student_id, date, period_id, status, remark, created_at, updated_at)
SELECT record_id, session_id, enrollment_id, student_id, date, period_id, status, remark, created_at, updated_at
FROM _attendance_ranked WHERE rank_in_group = 1;

-- codes only (a status), never a name or a remark: the audit trail holds no personal data
INSERT INTO audit_logs (at, actor, action, entity_type, entity_id, summary, before_json, after_json)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'system', 'ATTENDANCE_DUPLICATE_DROPPED', 'attendance_record', record_id,
       'attendance upgrade: a second record for the same student, day and session was left out', json_object('status', status), NULL
FROM _attendance_ranked WHERE rank_in_group > 1;

DROP TABLE _attendance_ranked;

DROP TABLE attendance_records;
DROP TABLE attendance_sessions;
ALTER TABLE attendance_sessions_new RENAME TO attendance_sessions;
ALTER TABLE attendance_records_new RENAME TO attendance_records;

CREATE INDEX idx_attendance_sessions_date ON attendance_sessions (date);
CREATE INDEX idx_attendance_records_enrollment ON attendance_records (enrollment_id);

CREATE TEMP TABLE _fk_assert (violations INTEGER NOT NULL CHECK (violations = 0));
INSERT INTO _fk_assert SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_assert;
