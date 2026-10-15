"""Immutable dataset versions with transactional activation and recoverable originals."""
import json
import os
import secrets
import shutil
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import fcntl
from sqlalchemy import create_engine, text
from .ingest import inspect

DATA = Path(os.environ.get('PQAVS_DATA_DIR', Path(__file__).resolve().parents[2] / 'data')).resolve()
DATA.mkdir(parents=True, exist_ok=True)
for directory in ['staging', 'versions', 'originals']: (DATA/directory).mkdir(exist_ok=True)
registry = create_engine('sqlite:///' + str(DATA/'registry.sqlite'), connect_args={'timeout':30})
with registry.begin() as c:
    c.execute(text('CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, created TEXT, filename TEXT, report TEXT)'))
    c.execute(text('CREATE TABLE IF NOT EXISTS active (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version TEXT)'))
    c.execute(text('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, created TEXT, action TEXT, version TEXT)'))
key_file = DATA/'admin.key'
if not key_file.exists():
    try:
        with key_file.open('x') as f: f.write(secrets.token_urlsafe(36))
        key_file.chmod(0o600)
    except FileExistsError: pass


def admin_key():
    return os.environ.get('PQAVS_ADMIN_TOKEN') or key_file.read_text().strip()


def active_id():
    with registry.connect() as c:
        return c.execute(text('SELECT version FROM active WHERE singleton=1')).scalar()


def dataset(version=None):
    version = version or active_id()
    if not version: return None
    return create_engine('sqlite:///' + str(DATA/'versions'/f'{version}.sqlite'), connect_args={'timeout':30})


@contextmanager
def writer_lock():
    with (DATA/'write.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try: yield
        finally: fcntl.flock(lock, fcntl.LOCK_UN)


def activate(version, action):
    with registry.begin() as c:
        if not c.execute(text('SELECT id FROM versions WHERE id=:v'), {'v':version}).scalar():
            raise ValueError('Versão não encontrada.')
        c.execute(text('INSERT INTO active(singleton,version) VALUES(1,:v) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version'), {'v':version})
        c.execute(text('INSERT INTO events(created,action,version) VALUES(:d,:a,:v)'), {'d':datetime.now(timezone.utc).isoformat(),'a':action,'v':version})


def import_file(path, filename, validated=None):
    report, frames = validated or inspect(path)
    if not report['valid']: raise ValueError('Arquivo inválido; confira o relatório de validação.')
    with writer_lock():
        version=uuid4().hex
        pending=DATA/'versions'/f'{version}.pending'
        engine=create_engine('sqlite:///'+str(pending))
        try:
            territory, observations, definitions=frames
            with engine.begin() as c:
                territory.to_sql('territories',c,index=False,if_exists='replace',chunksize=5000)
                observations.to_sql('observations',c,index=False,if_exists='replace',chunksize=5000)
                definitions.to_sql('definitions',c,index=False,if_exists='replace')
                for sql in [
                    'CREATE UNIQUE INDEX obs_key ON observations(ANO,COD_MUN,INDICADOR)',
                    'CREATE INDEX obs_filter ON observations(ANO,UF,INDICADOR,SITUACAO)',
                    'CREATE INDEX obs_municipality ON observations(COD_MUN,ANO)',
                    'CREATE UNIQUE INDEX territory_key ON territories(ANO,COD_MUN)',
                    'CREATE UNIQUE INDEX definition_key ON definitions(ANO,INDICADOR)']:
                    c.execute(text(sql))
            engine.dispose()
            pending.rename(DATA/'versions'/f'{version}.sqlite')
            shutil.copy2(path,DATA/'originals'/f'{version}.xlsx')
            with registry.begin() as c:
                c.execute(text('INSERT INTO versions VALUES(:v,:d,:f,:r)'), {'v':version,'d':datetime.now(timezone.utc).isoformat(),'f':Path(filename).name,'r':json.dumps(report,ensure_ascii=False)})
            activate(version,'importacao')
        except Exception:
            engine.dispose()
            pending.unlink(missing_ok=True)
            raise
    return version,report
