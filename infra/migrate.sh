#!/bin/sh
set -eu

attempt=1
max_attempts=${MIGRATION_ATTEMPTS:-12}
delay=${MIGRATION_RETRY_SECONDS:-5}
case "$max_attempts:$delay" in
	*[!0-9:]*|:*) echo "migration retry settings must be non-negative integers" >&2; exit 64 ;;
esac
if [ "$max_attempts" -lt 1 ]; then
	echo "MIGRATION_ATTEMPTS must be at least 1" >&2
	exit 64
fi

while [ "$attempt" -le "$max_attempts" ]; do
	if pnpm exec prisma migrate deploy; then
		echo "migrations applied"
		exit 0
	else
		status=$?
	fi
	if [ "$attempt" -eq "$max_attempts" ]; then
		echo "migration failed after $attempt attempt(s); application will not start" >&2
		exit "$status"
	fi
	echo "migration attempt $attempt/$max_attempts failed; retrying in ${delay}s" >&2
	attempt=$((attempt + 1))
	sleep "$delay"
done

exit 1
