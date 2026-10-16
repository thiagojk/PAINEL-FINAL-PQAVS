"""The platform adapter must preserve mutual exclusion between processes."""
import errno
import os
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace

import pytest

from backend.app import file_lock


def test_exclusive_lock_blocks_another_process(tmp_path):
    path, ready, acquired = [tmp_path / n for n in ['write.lock', 'ready', 'acquired']]
    code = '''
from pathlib import Path
import sys
from backend.app.file_lock import exclusive_file_lock
lock, ready, acquired = map(Path, sys.argv[1:])
ready.touch()
with exclusive_file_lock(lock):
    acquired.touch()
'''
    child = None
    try:
        with file_lock.exclusive_file_lock(path):
            child = subprocess.Popen([sys.executable, '-c', code, str(path), str(ready), str(acquired)],
                                     cwd=Path(__file__).resolve().parents[1])
            deadline = time.monotonic() + 10
            while not ready.exists():
                assert child.poll() is None and time.monotonic() < deadline
                time.sleep(0.05)
            time.sleep(0.2)
            assert not acquired.exists(), 'Second writer entered before the first released its lock.'
        assert child.wait(timeout=10) == 0
        assert acquired.exists()
    finally:
        if child is not None and child.poll() is None:
            child.kill()
            child.wait(timeout=10)


def test_windows_adapter_retries_contention_and_unlocks_on_exception(monkeypatch, tmp_path):
    calls = []

    def locking(fd, mode, length):
        calls.append((mode, os.lseek(fd, 0, os.SEEK_CUR), length))
        if len(calls) == 1:
            raise OSError(errno.EACCES, 'Synthetic contention')

    fake = SimpleNamespace(LK_NBLCK=2, LK_UNLCK=0, locking=locking)
    monkeypatch.setattr(file_lock, 'msvcrt', fake, raising=False)
    monkeypatch.setattr(file_lock, 'os', SimpleNamespace(name='nt', SEEK_END=os.SEEK_END))
    monkeypatch.setattr(file_lock.time, 'sleep', lambda seconds: None)
    path = tmp_path / 'write.lock'
    with pytest.raises(ValueError, match='body failed'):
        with file_lock.exclusive_file_lock(path):
            raise ValueError('body failed')
    assert calls == [(2, 0, 1), (2, 0, 1), (0, 0, 1)]
    assert path.read_bytes() == b'\0'
