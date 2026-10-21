"""Observe only the bounded staging unit; stop it if host services lose headroom."""
import json
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

unit = 'sdj-9router-build.service'
group = Path('/sys/fs/cgroup/memory/system.slice') / unit
destination = Path('/root/sdj-9router-build-observations.jsonl')


def stop_on_signal(signum, _frame):
    subprocess.run(['systemctl', 'stop', unit], check=False)
    raise SystemExit(128 + signum)


def stop_on_error(kind, value, traceback):
    subprocess.run(['systemctl', 'stop', unit], check=False)
    sys.__excepthook__(kind, value, traceback)


for stop_signal in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
    signal.signal(stop_signal, stop_on_signal)
sys.excepthook = stop_on_error


def number(path):
    try:
        return int(path.read_text().strip())
    except FileNotFoundError:
        return 0


def memory():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        name, value = line.split(':', 1)
        values[name] = int(value.strip().split()[0])
    return values


def ready(port, path):
    try:
        with urlopen('http://127.0.0.1:' + str(port) + path, timeout=3) as response:
            payload = json.load(response)
            return payload.get('status') == 'ready' or payload.get('ready') is True
    except Exception:
        return False


start = time.monotonic()
baseline = memory()
baseline_swap = baseline['SwapTotal'] - baseline['SwapFree']
if sys.argv[1:] not in ([], ['--start']):
    raise SystemExit('Usage: monitor.py [--start]')
if '--start' in sys.argv:
    subprocess.run(['systemctl', 'start', '--no-block', unit], check=True)
low_samples = 0
bad_health = 0
reason = None
last = {}
with destination.open('a') as log:
    while True:
        state = subprocess.check_output(['systemctl', 'show', unit, '-p', 'ActiveState', '-p', 'SubState', '-p', 'Result', '-p', 'ExecMainStatus'], universal_newlines=True)
        flags = dict(line.split('=', 1) for line in state.strip().splitlines())
        snapshot = memory()
        resident = number(group / 'memory.usage_in_bytes')
        combined = number(group / 'memory.memsw.usage_in_bytes')
        swap = max(0, combined - resident)
        phase_file = Path('/var/lib/9router/staging/build-phase')
        last = {'elapsedSeconds': round(time.monotonic()-start), 'phase': phase_file.read_text().strip(), 'availableMiB': round(snapshot['MemAvailable']/1024), 'buildResidentMiB': round(resident/1048576), 'buildSwapMiB': round(swap/1048576), 'hostSwapDeltaMiB': round((snapshot['SwapTotal']-snapshot['SwapFree']-baseline_swap)/1024), **flags}
        log.write(json.dumps(last)+'\n')
        log.flush()
        if flags['ActiveState'] in ('inactive', 'failed'):
            break
        low_samples = low_samples+1 if snapshot['MemAvailable'] < 150*1024 else 0
        if last['elapsedSeconds'] % 10 == 0:
            bad_health = 0 if ready(3000, '/health/ready') and ready(18789, '/readyz') else bad_health+1
        if low_samples >= 3:
            reason = 'HOST_MEMORY_HEADROOM'
        elif swap >= 512*1048576 or last['hostSwapDeltaMiB'] >= 512:
            reason = 'SWAP_BUDGET'
        elif bad_health >= 2:
            reason = 'SDJ_HEALTH'
        if reason:
            subprocess.run(['systemctl', 'stop', unit], check=True)
            stopped = subprocess.check_output(['systemctl', 'show', unit, '-p', 'ActiveState', '-p', 'SubState', '-p', 'Result', '-p', 'ExecMainStatus'], universal_newlines=True)
            last.update(dict(line.split('=', 1) for line in stopped.strip().splitlines()))
            break
        if last['elapsedSeconds'] % 30 == 0:
            print(json.dumps(last), flush=True)
        time.sleep(1)
print(json.dumps({'finished': True, 'stopReason': reason, **last}), flush=True)
raise SystemExit(0 if not reason and last.get('phase') == 'passed' and last.get('Result') == 'success' else 1)
