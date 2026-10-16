"""Serve only the compiled Vite application, after all FastAPI routes."""
from pathlib import Path

from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


FRONTEND_DIST = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
SPA_ROUTES = {
    '', 'estados', 'municipios', 'indicadores', 'historico',
    'comparacoes', 'dados', 'atualizar',
}


class FrontendFiles(StaticFiles):
    """Use index.html for React pages without hiding missing API/assets errors."""

    async def get_response(self, path, scope):
        parts = path.strip('/').split('/')
        # Never turn API errors, dotfiles or private server paths into SPA pages.
        if parts[0] in {'api', 'data', 'backend', 'tests', 'docs', 'redoc'} or any(
            part.startswith('.') and part != '.' for part in parts
        ):
            raise HTTPException(status_code=404)

        # React uses these routes (and query-string filters). No arbitrary server
        # directory is mounted: StaticFiles confines assets to frontend/dist.
        if path in {'.', ''} or path.strip('/') in SPA_ROUTES:
            response = await super().get_response('index.html', scope)
            response.headers['Cache-Control'] = 'no-cache'
            return response
        return await super().get_response(path, scope)


def mount_frontend(app: FastAPI, directory: Path = FRONTEND_DIST):
    """Keep API-only/Vite development available when no frontend build exists."""
    if (directory / 'index.html').is_file():
        app.mount('/', FrontendFiles(directory=directory), name='frontend')
