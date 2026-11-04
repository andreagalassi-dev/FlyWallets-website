#!/bin/sh
# Docker first-start hook: creates the restricted role `flywallets_app` so Row-Level Security is enforced
# for the API's data modules (see database/rls_app_role.sql). Runs after 01_schema.sql, only on an EMPTY volume.
# The password comes from APP_DB_PASSWORD (alphanumeric characters recommended).
set -e
psql -v ON_ERROR_STOP=1 -v app_password="'${APP_DB_PASSWORD}'" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /opt/flywallets/rls_app_role.sql
