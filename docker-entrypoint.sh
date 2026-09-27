#!/bin/sh
# Container startup: apply database migrations, then run the bot. Makes
# `docker compose up` turnkey - no manual migrate step. `prisma migrate deploy`
# is idempotent and advisory-locked, so it is safe to run on every start and
# across multiple cluster containers. Retries while the database warms up.
set -e

echo "Rostra: applying database migrations..."
i=1
ready=0
while [ "$i" -le 12 ]; do
	if npx prisma migrate deploy; then
		echo "Rostra: database is ready."
		ready=1
		break
	fi
	echo "Rostra: database not ready yet, retrying in 5s ($i/12)..."
	i=$((i + 1))
	sleep 5
done

if [ "$ready" -ne 1 ]; then
	echo "Rostra: database migrations failed after 12 attempts; refusing to start the bot." >&2
	exit 1
fi

echo "Rostra: starting the bot..."
exec npm start
