-- Spike-only tables to prove the table-rebuild pattern on a REFERENCED table (docs §5.4).
CREATE TABLE spike_parent (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    code  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
);

CREATE TABLE spike_child (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER NOT NULL REFERENCES spike_parent (id) ON DELETE RESTRICT,
    status     TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DONE'))
);

INSERT INTO spike_parent (code, name) VALUES ('P-1', 'សុខ ចាន់ណា');
INSERT INTO spike_child (parent_id, status) VALUES (1, 'ACTIVE');
