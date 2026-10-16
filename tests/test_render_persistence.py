"""Real FastAPI processes share a simulated Render disk across restarts."""
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

import httpx

from test_pipeline import workbook


@contextmanager
def running_server(data_dir, admin_token):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    environment = {
        **os.environ,
        'PQAVS_DATA_DIR': str(data_dir),
        'PQAVS_ADMIN_TOKEN': admin_token,
        'PORT': str(port),
    }
    # As with Render's shell start command, pass the assigned PORT to Uvicorn.
    process = subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', 'backend.app.main:app',
         '--host', '127.0.0.1', '--port', environment['PORT']],
        cwd=Path(__file__).resolve().parents[1], env=environment,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=30) as client:
            deadline = time.monotonic() + 30
            while True:
                assert process.poll() is None, 'FastAPI process exited before readiness.'
                try:
                    response = client.get('/api/health')
                    if response.status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                assert time.monotonic() < deadline, 'FastAPI readiness timed out.'
                time.sleep(0.1)
            yield client
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def test_empty_install_upload_confirmation_and_disk_survive_restarts(tmp_path):
    data = tmp_path / 'persistent-disk' / 'pqavs'
    token = secrets.token_urlsafe(32)
    headers = {'X-Admin-Token': token}
    source = workbook(tmp_path / 'synthetic.xlsx')

    with running_server(data, token) as client:
        assert client.get('/api/health').json() == {'status': 'ok', 'dataset': False}
        assert client.get('/api/catalog').json()['years'] == []
        assert client.get('/api/dashboard').status_code == 409
        assert client.get('/api/admin/importacoes').status_code == 401
        with source.open('rb') as file:
            response = client.post('/api/admin/validar', headers=headers,
                                   files={'file': ('synthetic.xlsx', file)})
        assert response.status_code == 200
        validation = response.json()
        assert validation['report']['valid']
        staged_token = validation['token']
        assert client.get('/api/health').json()['dataset'] is False

    key_digest = hashlib.sha256((data / 'admin.key').read_bytes()).hexdigest()
    assert (data / 'registry.sqlite').is_file()
    assert (data / 'staging' / f'{staged_token}.xlsx').is_file()

    # Even a pending validation survives a process restart, without activating it.
    with running_server(data, token) as client:
        assert client.get('/api/health').json()['dataset'] is False
        response = client.post('/api/admin/importar', headers=headers,
                               json={'token': staged_token})
        assert response.status_code == 200
        version = response.json()['version']
        assert client.get('/api/dashboard?year=2030').json()['summary']['total'] == 3

    original = data / 'originals' / f'{version}.xlsx'
    database = data / 'versions' / f'{version}.sqlite'
    assert database.is_file()
    assert original.read_bytes() == source.read_bytes()
    assert not (data / 'staging' / f'{staged_token}.xlsx').exists()

    # A fresh app process (as after a redeploy) reuses the same configured disk.
    with running_server(data, token) as client:
        assert client.get('/api/health').json()['dataset'] is True
        assert client.get('/api/catalog').json()['version'] == version
        assert client.get('/api/catalog').json()['years'] == [2030]
        assert client.get('/api/dashboard?year=2030').json()['summary']['reached'] == 1
        assert client.get('/api/admin/importacoes', headers=headers).json()['active'] == version
        for path in ['/data/admin.key', '/data/registry.sqlite',
                     f'/data/originals/{version}.xlsx', '/backend/app/storage.py']:
            assert client.get(path).status_code == 404

    assert hashlib.sha256((data / 'admin.key').read_bytes()).hexdigest() == key_digest
