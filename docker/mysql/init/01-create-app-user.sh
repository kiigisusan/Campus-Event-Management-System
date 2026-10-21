#!/bin/bash
# Runs once, the first time the MySQL container starts with an empty data volume.
#
# Creates the least-privilege user the API connects with at runtime. It can
# read and write rows in cems_db but cannot create, alter or drop tables,
# create users, or touch any other database. If the app were ever compromised,
# an attacker could not drop the schema or read other databases.
#
# Schema changes are made separately by `prisma migrate deploy`, using the
# privileged account (see MIGRATION_DATABASE_URL).
set -euo pipefail

: "${MYSQL_APP_USER:?MYSQL_APP_USER must be set}"
: "${MYSQL_APP_PASSWORD:?MYSQL_APP_PASSWORD must be set}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE must be set}"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "Created least-privilege user '${MYSQL_APP_USER}' on ${MYSQL_DATABASE}"
