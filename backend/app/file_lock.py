"""Blocking exclusive file lock with equivalent Windows and POSIX behavior."""
from contextlib import contextmanager
import errno
import os
import time

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


@contextmanager
def exclusive_file_lock(path):
    with path.open('a+b') as lock:
        if os.name == 'nt':
            # msvcrt locks a byte range from the current position.
            lock.seek(0, os.SEEK_END)
            if lock.tell() == 0:
                lock.write(b'\0')
                lock.flush()
            while True:
                lock.seek(0)
                try:
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError as error:
                    if error.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK}:
                        raise
                    time.sleep(0.1)
        else:
            fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == 'nt':
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock, fcntl.LOCK_UN)
