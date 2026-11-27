import json
import fcntl
import os
import pty
import select
import subprocess
import sys
import struct
import termios
import time

request = json.load(sys.stdin)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
process = subprocess.Popen(request['command'], cwd=request['cwd'], env=request['env'], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
output = b''
remaining = request['steps'][:]
window = b''
deadline = time.monotonic() + 8
while time.monotonic() < deadline:
    if select.select([master], [], [], .1)[0]:
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        output += chunk
        window += chunk
    if remaining and remaining[0][0].encode() in window:
        _, keys = remaining.pop(0)
        time.sleep(.1)
        os.write(master, keys.encode())
        window = b''
    if process.poll() is not None:
        break
if process.poll() is None:
    process.kill()
process.wait()
os.close(master)
json.dump({'status': process.returncode, 'output': output.decode(errors='replace'), 'remaining': remaining}, sys.stdout)
