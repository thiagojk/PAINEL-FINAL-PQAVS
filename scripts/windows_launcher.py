"""Windows double-click launcher. Standard library only; never edits manifests."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'frontend'
VENV_PYTHON = ROOT / '.venv' / 'Scripts' / 'python.exe'
LOCK = ROOT / 'backend' / 'requirements.lock'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def run(command, cwd=ROOT, quiet=False):
    return subprocess.run(command, cwd=cwd, check=True,
                          stdout=subprocess.DEVNULL if quiet else None,
                          stderr=subprocess.DEVNULL if quiet else None)


def npm_command(*args):
    # Fixed command/arguments, with cwd instead of embedding project paths in cmd.
    return [os.environ.get('COMSPEC', 'cmd.exe'), '/d', '/c', 'npm.cmd', *args]


def check_node():
    node = shutil.which('node.exe')
    if not node:
        raise RuntimeError('Node.js nao encontrado. Instale Node.js 24 LTS em '
                           'https://nodejs.org/ e reabra INICIAR_PAINEL.bat.')
    version = subprocess.check_output([node, '--version'], text=True).strip()
    if version.lstrip('v').split('.')[0] != '24':
        raise RuntimeError(f'Node.js {version} encontrado. Este projeto utiliza Node.js 24 LTS; '
                           'instale essa versao em https://nodejs.org/.')
    if not shutil.which('npm.cmd'):
        raise RuntimeError('npm nao encontrado. Reinstale Node.js 24 LTS incluindo npm e PATH.')
    run(npm_command('--version'), quiet=True)
    print(f'[OK] Python 3.12 e Node.js {version} encontrados.', flush=True)
    return subprocess.check_output(
        [node, '-p', 'process.versions.modules+":"+process.platform+":"+process.arch'],
        text=True,
    ).strip()


def prepare_python():
    if not VENV_PYTHON.is_file():
        print('[1/4] Criando ambiente virtual .venv...', flush=True)
        run([sys.executable, '-m', 'venv', str(ROOT / '.venv')])
    try:
        run([str(VENV_PYTHON), '-c',
             'import sys; sys.exit(sys.version_info[:2] != (3,12))'], quiet=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError('O .venv existente esta invalido ou usa outro Python. '
                           'Renomeie a pasta .venv e execute o iniciador novamente. '
                           'Nao remova a pasta data.') from exc
    # Compare every frozen requirement with installed metadata; no network if valid.
    check = (
        'import importlib.metadata as m, pathlib, sys; '
        'requirements=pathlib.Path(sys.argv[1]).read_text().splitlines(); '
        'expected=[line.split("==",1) for line in requirements '
        'if line.strip() and not line.startswith("#")]; '
        'sys.exit(0 if all(m.version(name)==version for name,version in expected) else 1)'
    )
    installed = subprocess.run(
        [str(VENV_PYTHON), '-c', check, str(LOCK)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
    if not installed:
        print('[1/4] Instalando dependencias Python do arquivo lock (requer internet)...', flush=True)
        run([str(VENV_PYTHON), '-m', 'pip', '--disable-pip-version-check',
             'install', '-r', str(LOCK)])
    else:
        print('[1/4] Dependencias Python ja instaladas; nenhuma reinstalacao.', flush=True)
    run([str(VENV_PYTHON), '-m', 'pip', '--disable-pip-version-check', 'check'])


def frontend_fingerprint(node_runtime):
    digest = hashlib.sha256()
    for name in ['package.json', 'package-lock.json']:
        digest.update((FRONTEND / name).read_bytes())
    digest.update(node_runtime.encode())
    return digest.hexdigest()


def prepare_frontend(node_runtime):
    expected = frontend_fingerprint(node_runtime)
    stamp = FRONTEND / 'node_modules' / '.pqavs-launcher-stamp'
    installed = stamp.is_file() and stamp.read_text().strip() == expected
    if installed:
        installed = subprocess.run(npm_command('ls', '--depth=0', '--include=dev'),
                                   cwd=FRONTEND, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL).returncode == 0
    if not installed:
        print('[2/4] Preparando dependencias Node (requer internet na primeira vez)...', flush=True)
        run(npm_command('ci', '--include=dev'), cwd=FRONTEND)
        stamp.write_text(expected)
    else:
        print('[2/4] Dependencias Node ja preparadas; nenhuma reinstalacao.', flush=True)


def get_json(path, port):
    with OPENER.open(f'http://127.0.0.1:{port}{path}', timeout=2) as response:
        return json.load(response)


def backend_ready():
    try:
        health = get_json('/api/health', 8000)
        catalog = get_json('/api/catalog', 8000)
        return (health.get('status') == 'ok' and isinstance(health.get('dataset'), bool)
                and isinstance(catalog.get('years'), list)
                and isinstance(catalog.get('definitions'), list) and 'version' in catalog)
    except (OSError, ValueError, AttributeError):
        return False


def frontend_ready():
    try:
        with OPENER.open('http://127.0.0.1:5173/', timeout=2) as response:
            html = response.read().decode('utf-8')
        return ('PQAVS' in html and '/@vite/client' in html
                and get_json('/api/health', 5173).get('status') == 'ok'
                and get_json('/api/catalog', 5173).get('version')
                == get_json('/api/catalog', 8000).get('version'))
    except (OSError, ValueError, AttributeError):
        return False


def port_in_use(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.5):
            return True
    except OSError:
        return False


def start_and_wait(service, port, ready):
    if ready():
        print(f'[OK] {service} ja esta funcionando na porta {port}; reutilizando.', flush=True)
        return
    if port_in_use(port):
        raise RuntimeError(f'A porta {port} esta ocupada por um servico nao identificado ou '
                           'ainda inicializando. Verifique as janelas abertas e tente novamente. '
                           'Nenhum processo foi encerrado.')
    process = subprocess.Popen(
        [str(VENV_PYTHON), str(Path(__file__).resolve()), f'--{service}'],
        cwd=ROOT, creationflags=subprocess.CREATE_NEW_CONSOLE,
    )
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        if ready():
            print(f'[OK] {service} pronto na porta {port}.', flush=True)
            return
        if process.poll() is not None:
            break
        time.sleep(1)
    raise RuntimeError(f'{service} nao ficou pronto em ate 120 segundos. '
                       'Consulte a janela desse servico; o navegador nao sera aberto.')


def service_window(service):
    import ctypes
    ctypes.windll.kernel32.SetConsoleTitleW(f'PQAVS - {service}')
    print(f'PQAVS - {service}. Para encerrar, pressione Ctrl+C nesta janela.', flush=True)
    try:
        if service == 'backend':
            run([str(VENV_PYTHON), '-m', 'uvicorn', 'backend.app.main:app',
                 '--host', '127.0.0.1', '--port', '8000'])
        else:
            run(npm_command('run', 'dev', '--', '--host', '127.0.0.1',
                            '--port', '5173', '--strictPort'), cwd=FRONTEND)
    except KeyboardInterrupt:
        return
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f'[ERRO] {service} interrompido ({type(exc).__name__}). '
              'Consulte as mensagens acima.', flush=True)
        input('Pressione Enter para fechar esta janela...')


def main():
    if os.name != 'nt':
        raise RuntimeError('Este iniciador e exclusivo para Windows.')
    if len(sys.argv) == 2 and sys.argv[1] in {'--backend', '--frontend'}:
        service_window(sys.argv[1][2:])
        return
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError('Instale Python 3.12 e execute INICIAR_PAINEL.bat novamente.')
    runtime = check_node()
    prepare_python()
    prepare_frontend(runtime)
    print('[3/4] Iniciando os servicos em janelas separadas...', flush=True)
    start_and_wait('backend', 8000, backend_ready)
    start_and_wait('frontend', 5173, frontend_ready)
    print('[4/4] Comunicacao frontend/backend confirmada. Abrindo o navegador...', flush=True)
    if not webbrowser.open('http://localhost:5173'):
        raise RuntimeError('Os servicos estao prontos, mas o navegador nao abriu. '
                           'Acesse http://localhost:5173 manualmente.')
    print('[OK] Painel disponivel em http://localhost:5173', flush=True)
    print('Mantenha as janelas backend e frontend abertas enquanto utilizar o painel.', flush=True)
    print('Se a base ainda nao foi importada, utilize Atualizar Dados no painel.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'\n[ERRO] {error}', flush=True)
        sys.exit(1)
