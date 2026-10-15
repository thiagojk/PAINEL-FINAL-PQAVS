"""Explicit local administration, without logging the administrative key."""
import argparse
import json
from pathlib import Path
from .storage import import_file, inspect
p=argparse.ArgumentParser(); p.add_argument('command',choices=['validate','import']); p.add_argument('file',type=Path)
a=p.parse_args()
report,frames=inspect(a.file)
print(json.dumps(report,ensure_ascii=False,indent=2))
if not report['valid']: raise SystemExit(1)
if a.command=='import':
    v,_=import_file(a.file,a.file.name,(report,frames)); print('Versão importada:',v)
