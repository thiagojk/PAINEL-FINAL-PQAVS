"""Production routing: frontend assets must not expose private server files."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.frontend import mount_frontend


@pytest.fixture
def served(tmp_path):
    dist = tmp_path / 'frontend' / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<html>compiled frontend</html>')
    (dist / 'assets' / 'app.js').write_text('console.log("compiled asset");')
    (tmp_path / 'data').mkdir()
    (tmp_path / 'data' / 'admin.key').write_text('private-test-key')
    (tmp_path / '.env').write_text('PRIVATE=synthetic-value')
    app = FastAPI()

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'dataset': False}

    mount_frontend(app, dist)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize('path', [
    '/', '/estados', '/municipios', '/indicadores', '/historico',
    '/comparacoes', '/dados', '/atualizar', '/historico/?uf=PA&indicator=6',
])
def test_spa_direct_navigation_and_refresh(served, path):
    response = served.get(path)
    assert response.status_code == 200
    assert response.text == '<html>compiled frontend</html>'
    assert response.headers['content-type'].startswith('text/html')
    assert response.headers['cache-control'] == 'no-cache'
    assert served.head(path).status_code == 200


def test_api_openapi_assets_and_http_methods(served):
    assert served.get('/api/health').json() == {'status': 'ok', 'dataset': False}
    assert served.get('/docs').status_code == 200
    assert served.get('/openapi.json').json()['openapi']
    asset = served.get('/assets/app.js')
    assert asset.status_code == 200
    assert 'javascript' in asset.headers['content-type']
    assert served.post('/atualizar').status_code == 405


@pytest.mark.parametrize('path', [
    '/api/missing', '/assets/missing.js', '/missing.js',
    '/data/admin.key', '/data/registry.sqlite', '/data/originals/base.xlsx',
    '/backend/app/storage.py', '/README.md', '/.env', '/.git/config',
    '/assets/%2e%2e/%2e%2e/data/admin.key', '/data',
])
def test_private_paths_and_missing_assets_are_not_served(served, path):
    response = served.get(path)
    assert response.status_code == 404
    assert 'private-test-key' not in response.text
    assert 'synthetic-value' not in response.text
    assert 'compiled frontend' not in response.text


def test_development_without_dist_keeps_api_only(tmp_path):
    app = FastAPI()

    @app.get('/api/health')
    def health():
        return {'status': 'ok'}

    mount_frontend(app, tmp_path / 'missing-dist')
    with TestClient(app) as client:
        assert client.get('/api/health').status_code == 200
        assert client.get('/').status_code == 404
