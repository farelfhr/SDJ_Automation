#!/usr/bin/env bash
set -euo pipefail
# systemd 239 / cgroup v1 does not enforce MemorySwapMax separately. Bound the
# combined resident+swap charge to 1 GiB and additionally police swap in monitor.py.
group=/sys/fs/cgroup/memory/system.slice/sdj-9router-build.service
test -f "$group/memory.memsw.limit_in_bytes"
printf '536870912\n' > "$group/memory.limit_in_bytes"
printf '402653184\n' > "$group/memory.soft_limit_in_bytes"
printf '1073741824\n' > "$group/memory.memsw.limit_in_bytes"
test "$(cat "$group/memory.limit_in_bytes")" = 536870912
test "$(cat "$group/memory.memsw.limit_in_bytes")" = 1073741824
