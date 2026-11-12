#!/usr/bin/env bash
# Valida a migração e as políticas RLS num PostgreSQL local (16+).
# Uso: PGURL="postgres://postgres@localhost:5432" ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:-postgres://postgres@localhost:5432}"
psql "$PGURL/postgres" -q -c "drop database if exists prive_test" -c "create database prive_test"
psql "$PGURL/prive_test" -q -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql -f migrations/0001_init.sql
psql "$PGURL/prive_test" -q -t -f tests/rls_test.sql
