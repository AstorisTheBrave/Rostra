#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
	echo "start-app: application command is required" >&2
	exit 64
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$script_dir/migrate.sh"
exec "$@"
