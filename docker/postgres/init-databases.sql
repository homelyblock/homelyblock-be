-- Runs only on first volume initialization (empty data directory).
-- POSTGRES_DB already creates livingspace_dev; this adds the integration DB.
CREATE DATABASE livingspace_test;
