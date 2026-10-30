-- Rebuild a table that another table references. Flyway runs this on a connection with foreign_keys OFF
-- and the migration ends with an assertion that aborts it on any FK violation.
CREATE TABLE spike_parent_new (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    code   TEXT NOT NULL UNIQUE,
    name   TEXT NOT NULL,
    extra  TEXT
);

INSERT INTO spike_parent_new (id, code, name) SELECT id, code, name FROM spike_parent;
DROP TABLE spike_parent;
ALTER TABLE spike_parent_new RENAME TO spike_parent;

CREATE TEMP TABLE _fk_assert (violations INTEGER NOT NULL CHECK (violations = 0));
INSERT INTO _fk_assert SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE _fk_assert;
