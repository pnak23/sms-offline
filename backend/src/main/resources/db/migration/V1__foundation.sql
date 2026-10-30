-- V1: foundation tables (accounts, settings, sequences, audit).
-- Conventions (docs/PHASE0-ARCHITECTURE.md §5.1): dates TEXT 'YYYY-MM-DD', timestamps TEXT ISO-8601 UTC,
-- no floating point, CHECK constraints on enum-like columns, created_at / updated_at everywhere.

CREATE TABLE app_users (
    id                         INTEGER PRIMARY KEY AUTOINCREMENT,
    username                   TEXT    NOT NULL UNIQUE,
    display_name               TEXT    NOT NULL,
    role                       TEXT    NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN')),
    password_hash              TEXT    NOT NULL,
    password_changed_at        TEXT    NOT NULL,
    recovery_key_hash          TEXT    NOT NULL,
    recovery_key_created_at    TEXT    NOT NULL,
    recovery_key_confirmed_at  TEXT,
    failed_attempts            INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until               TEXT,
    recovery_failed_attempts   INTEGER NOT NULL DEFAULT 0 CHECK (recovery_failed_attempts >= 0),
    recovery_locked_until      TEXT,
    is_active                  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    version                    INTEGER NOT NULL DEFAULT 0,
    created_at                 TEXT    NOT NULL,
    updated_at                 TEXT    NOT NULL
);

CREATE TABLE school_settings (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    name_km        TEXT,
    name_en        TEXT,
    address        TEXT,
    phone          TEXT,
    director_name  TEXT,
    logo_file      TEXT,
    version        INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

INSERT INTO school_settings (id, created_at, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

CREATE TABLE app_settings (
    setting_key    TEXT PRIMARY KEY,
    setting_value  TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE id_sequences (
    name        TEXT    NOT NULL,
    year        INTEGER NOT NULL DEFAULT 0,
    next_value  INTEGER NOT NULL CHECK (next_value >= 1),
    PRIMARY KEY (name, year)
);

CREATE TABLE audit_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    at           TEXT    NOT NULL,
    actor        TEXT,
    action       TEXT    NOT NULL,
    entity_type  TEXT,
    entity_id    INTEGER,
    summary      TEXT,
    before_json  TEXT,
    after_json   TEXT
);

CREATE INDEX idx_audit_logs_at     ON audit_logs (at);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
