-- V5: Phase 4 (reports and administration): a grading scale frozen per examination, school events for the dashboard, optional fees.
-- Money is stored in the smallest unit of its currency (KHR: riel; USD: cents) with the currency on every record; no floating point.

-- ---- grading scale frozen per examination -------------------------------------------------------------------------
-- NULL = nothing has been scored yet, so results use the current default scale. The first score entered records the scale in use,
-- and from then on the examination is graded with that scale whatever happens to the default.
ALTER TABLE examinations ADD COLUMN grading_scale_id INTEGER REFERENCES grading_scales (id);

-- Editing a scale that an examination already uses makes a NEW scale and archives the old one (which stays for those examinations).
ALTER TABLE grading_scales ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));

-- Examinations scored before this migration keep the scale that is the default now.
UPDATE examinations
SET grading_scale_id = (SELECT id FROM grading_scales WHERE is_default = 1)
WHERE EXISTS (SELECT 1 FROM student_scores sc JOIN examination_subjects es ON es.id = sc.examination_subject_id WHERE es.examination_id = examinations.id);

-- ---- school events (the dashboard's "upcoming events") ---------------------------------------------------------------
CREATE TABLE school_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title_km    TEXT    NOT NULL,
    start_date  TEXT    NOT NULL,
    end_date    TEXT,
    note        TEXT,
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_school_events_start ON school_events (start_date);

-- ---- fees (optional: switched on in Settings, off by default) ---------------------------------------------------------
CREATE TABLE fee_categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name_km         TEXT    NOT NULL UNIQUE,
    default_amount  INTEGER NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
    currency        TEXT    NOT NULL DEFAULT 'KHR' CHECK (currency IN ('KHR', 'USD')),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    version         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

-- What a student owes: one row per charge (a category can be charged again, e.g. every month). History hangs off the enrollment.
CREATE TABLE student_fees (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id  INTEGER NOT NULL REFERENCES enrollments (id),
    category_id    INTEGER NOT NULL REFERENCES fee_categories (id),
    amount_due     INTEGER NOT NULL CHECK (amount_due > 0),
    currency       TEXT    NOT NULL CHECK (currency IN ('KHR', 'USD')),
    due_date       TEXT,
    note           TEXT,
    version        INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

CREATE INDEX idx_student_fees_enrollment ON student_fees (enrollment_id);

-- A payment is never deleted: a mistake is voided with a reason and the receipt number stays on record.
CREATE TABLE fee_payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_fee_id  INTEGER NOT NULL REFERENCES student_fees (id),
    amount          INTEGER NOT NULL CHECK (amount > 0),
    paid_on         TEXT    NOT NULL,
    method          TEXT    NOT NULL DEFAULT 'CASH' CHECK (method IN ('CASH', 'BANK', 'OTHER')),
    reference       TEXT,
    receipt_no      TEXT    NOT NULL UNIQUE,
    voided_at       TEXT,
    void_reason     TEXT,
    created_at      TEXT    NOT NULL,
    CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX idx_fee_payments_fee ON fee_payments (student_fee_id);
