-- V2: the academic basics the first-launch wizard needs (academic year, grades 1-6, subjects).
-- Classes, students, enrollments, attendance, exams ... arrive in later migrations.

CREATE TABLE academic_years (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name_km     TEXT    NOT NULL UNIQUE,
    start_date  TEXT    NOT NULL,
    end_date    TEXT    NOT NULL,
    is_current  INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
    status      TEXT    NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    CHECK (end_date > start_date)
);

-- at most one current academic year
CREATE UNIQUE INDEX uq_academic_years_current ON academic_years (is_current) WHERE is_current = 1;

CREATE TABLE grades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       INTEGER NOT NULL UNIQUE CHECK (level BETWEEN 1 AND 6),
    name_km     TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

INSERT INTO grades (level, name_km, created_at, updated_at) VALUES
    (1, 'ថ្នាក់ទី១', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    (2, 'ថ្នាក់ទី២', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    (3, 'ថ្នាក់ទី៣', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    (4, 'ថ្នាក់ទី៤', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    (5, 'ថ្នាក់ទី៥', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    (6, 'ថ្នាក់ទី៦', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

CREATE TABLE subjects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,
    name_km     TEXT    NOT NULL,
    name_en     TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- Starting subjects; fully editable afterwards (never hardcoded in application logic).
INSERT INTO subjects (code, name_km, name_en, sort_order, is_active, created_at, updated_at) VALUES
    ('KHMER',   'ភាសាខ្មែរ',               'Khmer Language',             1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('MATH',    'គណិតវិទ្យា',              'Mathematics',                2, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('SCIENCE', 'វិទ្យាសាស្ត្រ',            'Science',                    3, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('SOCIAL',  'សិក្សាសង្គម',              'Social Studies',             4, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('MORAL',   'សីលធម៌-ពលរដ្ឋវិជ្ជា',      'Moral and Civics Education', 5, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('PE',      'អប់រំកាយ និងកីឡា',         'Physical Education',         6, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('ART',     'សិល្បៈ',                  'Art',                        7, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('ENGLISH', 'ភាសាអង់គ្លេស',            'English',                    8, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
