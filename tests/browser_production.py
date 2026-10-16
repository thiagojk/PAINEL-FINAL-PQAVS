"""Optional Chromium smoke test of the compiled frontend + API on one origin.

Run after npm --prefix frontend run build. Requires Playwright and Chromium.
Only synthetic data in a temporary directory is imported; no external deployment.
"""
from contextlib import contextmanager
import hashlib
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time

import httpx
import pandas as pd
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def server(data, token):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    python = ROOT / '.venv' / 'bin' / 'python'
    environment = {**os.environ, 'PQAVS_DATA_DIR': str(data),
                   'PQAVS_ADMIN_TOKEN': token, 'PORT': str(port)}
    process = subprocess.Popen(
        [str(python) if python.exists() else sys.executable, '-m', 'uvicorn',
         'backend.app.main:app', '--host', '0.0.0.0', '--port', environment['PORT']],
        cwd=ROOT, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f'http://127.0.0.1:{port}'
    try:
        with httpx.Client(base_url=base, timeout=30) as client:
            deadline = time.monotonic() + 30
            while True:
                assert process.poll() is None, 'Production process exited.'
                try:
                    if client.get('/api/health').status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                assert time.monotonic() < deadline, 'Startup timeout.'
                time.sleep(0.1)
            yield base, client
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def main():
    assert (ROOT / 'frontend/dist/index.html').is_file(), 'Build the frontend first.'
    with TemporaryDirectory(prefix='pqavs-render-browser-') as temp, sync_playwright() as p:
        directory = Path(temp)
        data = directory / 'persistent-data'
        file = directory / 'synthetic.xlsx'
        dictionary = pd.DataFrame([{'ANO': 2030, 'INDICADOR': 16,
            'DESCRICAO': 'Indicador sintético de teste', 'LABEL_NUM': 'Numerador',
            'LABEL_DEN': 'Denominador', 'LABEL_RES': 'Resultado', 'LABEL_META': 'Meta >= 90%'}])
        observations = pd.DataFrame([
            {'ANO': 2030, 'UF': 'PA', 'COD_MUN': 150140, 'NOME_MUN': 'Cidade A', 'POP_ANO': 1000,
             'IND_16_NUM': 9, 'IND_16_DEN': 10, 'IND_16_RES': .9, 'IND_16_META': 'Sim', 'IND_16_ALCANCE_META': 1},
            {'ANO': 2030, 'UF': 'PA', 'COD_MUN': 150150, 'NOME_MUN': 'Cidade B', 'POP_ANO': 2000,
             'IND_16_NUM': 3, 'IND_16_DEN': 10, 'IND_16_RES': .3, 'IND_16_META': 'Não', 'IND_16_ALCANCE_META': 0},
        ])
        with pd.ExcelWriter(file) as writer:
            dictionary.to_excel(writer, sheet_name='Indicadores e Metas por Ano', index=False)
            observations.to_excel(writer, sheet_name='PQA_VS_2030', index=False)
        token = secrets.token_urlsafe(32)
        browser = p.chromium.launch(
            executable_path=os.environ.get('PQAVS_CHROMIUM', '/usr/bin/chromium'),
            headless=True, args=['--no-sandbox'],
        )
        try:
            with server(data, token) as (base, client):
                page = browser.new_page(viewport={'width': 1440, 'height': 1000})
                errors, requests = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: requests.append(request.url))
                assert client.get('/api/health').json()['dataset'] is False
                page.goto(base)
                page.get_by_text('Seu painel começa com uma base validada', exact=True).wait_for()
                page.get_by_role('link', name='Atualizar Dados', exact=True).click()
                page.get_by_label('Chave administrativa', exact=True).fill(token)
                page.get_by_label('Arquivo Excel').set_input_files(str(file))
                page.get_by_role('button', name='Validar arquivo', exact=True).click()
                page.get_by_text('✓ Arquivo válido com observações', exact=True).wait_for()
                assert client.get('/api/health').json()['dataset'] is False
                page.get_by_role('button', name='Confirmar importação', exact=True).click()
                page.get_by_text('Base importada.', exact=False).wait_for()
                page.get_by_role('link', name='Visão Geral', exact=True).click()
                page.get_by_text('Situação das metas', exact=True).wait_for()
                summary = client.get('/api/dashboard?year=2030').json()['summary']
                assert (summary['reached'], summary['failed']) == (1, 1)
                version = client.get('/api/catalog').json()['version']
                assets = [url for url in requests if '/assets/' in url]
                assert assets and any('.js' in url for url in assets) and any('.css' in url for url in assets)
                for asset in set(assets):
                    assert client.get(asset).status_code == 200
                assert all(url.startswith(base + '/') or url == base for url in requests)
                for route, title in [('/estados', 'Estados'), ('/municipios', 'Municípios'),
                    ('/indicadores', 'Indicadores'), ('/historico', 'Análise Histórica'),
                    ('/comparacoes', 'Comparações'), ('/dados', 'Tabela de Dados'),
                    ('/atualizar', 'Atualizar Dados')]:
                    page.goto(base + route + '?year=2030')
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                    page.reload()
                    page.get_by_role('heading', name=title, exact=True, level=1).wait_for()
                assert not errors, errors
                page.close()
                key_digest = hashlib.sha256((data / 'admin.key').read_bytes()).hexdigest()
                print('PASS: empty installation, administrative upload/validation/confirmation, dashboard, JS/CSS, same-origin API, all SPA refreshes; no JavaScript errors.')
            with server(data, token) as (base, client):
                assert client.get('/api/catalog').json()['version'] == version
                assert client.get('/api/dashboard?year=2030').json()['summary']['total'] == 2
                page = browser.new_page()
                page.goto(base + '/municipios?year=2030')
                page.get_by_role('button', name='Cidade A', exact=True).wait_for()
                assert hashlib.sha256((data / 'admin.key').read_bytes()).hexdigest() == key_digest
                assert (data / 'originals' / f'{version}.xlsx').is_file()
                assert (data / 'versions' / f'{version}.sqlite').is_file()
                print('PASS: fresh server process retains catalog, dashboard, municipal UI, admin key and original/version files on the configured disk.')
                page.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()
