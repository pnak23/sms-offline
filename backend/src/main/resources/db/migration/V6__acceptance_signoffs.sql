-- V6: the school's sign-off of each acceptance item (docs/FINAL-SCHOOL-ACCEPTANCE.md).
-- The list of items and what is still pending for each ships with the program (release/acceptance.json) and can only claim
-- "development completed" or "still pending". "Final school acceptance completed" exists ONLY as a row here, written by the
-- administrator with a name and a time: nothing in a build or a test can create one.
CREATE TABLE acceptance_signoffs (
    item_id    TEXT PRIMARY KEY,
    signed_by  TEXT NOT NULL,   -- the administrator's display name when they signed
    username   TEXT NOT NULL,
    signed_at  TEXT NOT NULL,
    note       TEXT
);
