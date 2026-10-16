"""Launcher decisions are testable without installing tools or opening windows."""
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import windows_launcher as launcher


def test_missing_node_has_actionable_message(monkeypatch):
    monkeypatch.setattr(launcher.shutil, 'which', lambda name: None)
    with pytest.raises(RuntimeError, match='Node.js nao encontrado.*https://nodejs.org/'):
        launcher.check_node()


def test_existing_service_is_reused_without_spawning(monkeypatch):
    def unexpected(*args, **kwargs):
        raise AssertionError('An existing healthy service must not be restarted.')
    monkeypatch.setattr(launcher.subprocess, 'Popen', unexpected)
    launcher.start_and_wait('backend', 8000, lambda: True)


def test_unknown_busy_port_never_spawns_or_kills_processes(monkeypatch):
    monkeypatch.setattr(launcher, 'port_in_use', lambda port: True)
    monkeypatch.setattr(launcher.subprocess, 'Popen',
                        lambda *args, **kwargs: pytest.fail('Must not start on a busy port.'))
    with pytest.raises(RuntimeError, match='porta 5173 esta ocupada'):
        launcher.start_and_wait('frontend', 5173, lambda: False)


def test_valid_python_dependencies_do_not_run_install(monkeypatch, tmp_path):
    python = tmp_path / 'python.exe'
    python.touch()
    monkeypatch.setattr(launcher, 'VENV_PYTHON', python)
    monkeypatch.setattr(launcher.subprocess, 'run',
                        lambda *args, **kwargs: SimpleNamespace(returncode=0))
    commands = []
    monkeypatch.setattr(launcher, 'run', lambda command, **kwargs: commands.append(command))
    launcher.prepare_python()
    assert not any('install' in command or 'venv' in command for command in commands)
    assert any('check' in command for command in commands)


def test_missing_python_package_triggers_frozen_install(monkeypatch, tmp_path):
    python = tmp_path / 'python.exe'
    python.touch()
    monkeypatch.setattr(launcher, 'VENV_PYTHON', python)
    monkeypatch.setattr(launcher.subprocess, 'run',
                        lambda *args, **kwargs: SimpleNamespace(returncode=1))
    commands = []
    monkeypatch.setattr(launcher, 'run', lambda command, **kwargs: commands.append(command))
    launcher.prepare_python()
    assert [c for c in commands if 'install' in c] == [
        [str(python), '-m', 'pip', '--disable-pip-version-check', 'install', '-r', str(launcher.LOCK)]
    ]


def test_node_install_is_skipped_until_lock_changes(monkeypatch, tmp_path):
    frontend = tmp_path / 'project with spaces' / 'frontend'
    (frontend / 'node_modules').mkdir(parents=True)
    (frontend / 'package.json').write_text('{"name":"test"}')
    lock = frontend / 'package-lock.json'
    lock.write_text('{"lockfileVersion":3}')
    monkeypatch.setattr(launcher, 'FRONTEND', frontend)
    stamp = frontend / 'node_modules' / '.pqavs-launcher-stamp'
    stamp.write_text(launcher.frontend_fingerprint('abi:win32:x64'))
    monkeypatch.setattr(launcher.subprocess, 'run',
                        lambda *args, **kwargs: SimpleNamespace(returncode=0))
    commands = []
    monkeypatch.setattr(launcher, 'run', lambda command, **kwargs: commands.append(command))
    launcher.prepare_frontend('abi:win32:x64')
    assert commands == []
    lock.write_text('{"lockfileVersion":3,"updated":true}')
    launcher.prepare_frontend('abi:win32:x64')
    assert len(commands) == 1 and commands[0][-2:] == ['ci', '--include=dev']
    assert stamp.read_text() == launcher.frontend_fingerprint('abi:win32:x64')
    assert launcher.frontend_fingerprint('abi:win32:arm64') != stamp.read_text()


def test_broken_node_install_is_repaired(monkeypatch, tmp_path):
    (tmp_path / 'node_modules').mkdir()
    (tmp_path / 'package.json').write_text('{}')
    (tmp_path / 'package-lock.json').write_text('{}')
    monkeypatch.setattr(launcher, 'FRONTEND', tmp_path)
    stamp = tmp_path / 'node_modules' / '.pqavs-launcher-stamp'
    stamp.write_text(launcher.frontend_fingerprint('win32'))
    monkeypatch.setattr(launcher.subprocess, 'run',
                        lambda *args, **kwargs: SimpleNamespace(returncode=1))
    commands = []
    monkeypatch.setattr(launcher, 'run', lambda command, **kwargs: commands.append(command))
    launcher.prepare_frontend('win32')
    assert len(commands) == 1 and 'ci' in commands[0]
