"""PQAVS API. Use the Vite proxy / same origin for frontend requests."""
import io
import json
import logging
import re
import secrets
from pathlib import Path
from uuid import uuid4
import pandas as pd
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from . import analytics as a
from .frontend import mount_frontend
from .storage import DATA, active_id, admin_key, import_file, inspect, registry, activate, writer_lock

app=FastAPI(title='PQAVS — Indicadores e Metas',version='1.0.0')


@app.exception_handler(Exception)
async def unexpected(request,exc):
    logging.error('Falha na operação %s (%s)', request.url.path, type(exc).__name__)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500,content={'detail':'Não foi possível concluir a operação. Tente novamente ou contate o administrador.'})


def version():
    v=active_id()
    if not v: raise HTTPException(409,'Nenhuma base importada. Acesse Atualizar Dados.')
    return v


def filters(year:int|None=None, start:int|None=None,end:int|None=None,uf:str|None=None,municipality:str|None=None,indicator:int|None=None,status:str|None=None,search:str|None=Query(None,max_length=100),pop_min:int|None=Query(None,ge=0),pop_max:int|None=Query(None,ge=0)):
    if start and end and start>end: raise HTTPException(422,'Período inicial maior que o final.')
    return {k:v for k,v in locals().items() if v is not None}


def admin(x_admin_token:str=Header(default='')):
    if not secrets.compare_digest(x_admin_token,admin_key()): raise HTTPException(401,'Informe a chave administrativa válida.')


@app.get('/api/health')
def health(): return {'status':'ok','dataset':bool(active_id())}


@app.get('/api/catalog')
def catalog():
    v=active_id()
    if not v: return {'years':[],'states':[],'definitions':[],'changes':[],'version':None}
    return {'years':[r['ANO'] for r in a.query(v,'SELECT DISTINCT ANO FROM territories ORDER BY ANO')], 'states':[r['UF'] for r in a.query(v,'SELECT DISTINCT UF FROM territories ORDER BY UF')],'definitions':a.definitions(v),'changes':a.methodology(v),'version':v}


@app.get('/api/municipios')
def municipalities(f:dict=Depends(filters),v:str=Depends(version),page:int=Query(1,ge=1),page_size:int=Query(25,ge=1,le=100),sort:str='percentage',direction:str='desc'):
    return a.territorial_rows(v,f,page,page_size,sort,direction)


@app.get('/api/dashboard')
def dashboard(f:dict=Depends(filters),v:str=Depends(version)):
    return a.dashboard_cached(v,json.dumps(f,sort_keys=True))


@app.get('/api/estados')
def states(f:dict=Depends(filters),v:str=Depends(version),sort:str='percentage',direction:str='desc'):
    if f.get('search'):
        f['uf']=f.pop('search').upper()
    return a.territorial_rows(v,f,1,100,sort,direction,'state')


@app.get('/api/observations')
def observations(f:dict=Depends(filters),v:str=Depends(version),page:int=Query(1,ge=1),page_size:int=Query(25,ge=1,le=100)):
    w,p=a.where(f); p.update(limit=page_size,offset=(page-1)*page_size)
    count=a.query(v,'SELECT COUNT(*) AS count FROM observations o'+w,p)[0]['count']
    rows=a.query(v,'SELECT o.*, d.DESCRICAO,d.LABEL_META,d.LABEL_NUM,d.LABEL_DEN,d.LABEL_RES FROM observations o LEFT JOIN definitions d ON d.ANO=o.ANO AND d.INDICADOR=o.INDICADOR'+w+' ORDER BY o.ANO,o.COD_MUN,o.INDICADOR LIMIT :limit OFFSET :offset',p)
    return {'rows':rows,'total':count}


@app.get('/api/history')
def history(f:dict=Depends(filters),v:str=Depends(version),level:str=Query('national',pattern='^(national|state|municipality)$'),rank_page:int=Query(1,ge=1)):
    f.pop('year',None)
    series=a.aggregate(v,f,'indicators')
    ranking,rank_total=a.historical_ranking(v,f,rank_page) if level=='municipality' else (a.aggregate(v,f,'state_history') if level=='state' else [],0)
    rows=[]
    if f.get('municipality'):
        w,p=a.where(f)
        rows=a.query(v,'SELECT o.ANO,o.INDICADOR,o.RESULTADO,o.NUMERADOR,o.DENOMINADOR,o.SITUACAO,o.OBSERVACAO,d.LABEL_META,d.DESCRICAO FROM observations o JOIN definitions d ON d.ANO=o.ANO AND d.INDICADOR=o.INDICADOR'+w+' ORDER BY o.ANO,o.INDICADOR',p)
    totals=a.aggregate(v,f,'years')
    first=totals[0] if totals else None; last=totals[-1] if totals else None
    highlights=[]
    w,p=a.where(f)
    persistent=a.query(v,"SELECT COD_MUN,NOME_MUN,UF,COUNT(DISTINCT ANO) years,"+a.AGG+" FROM observations o"+w+" GROUP BY COD_MUN,NOME_MUN,UF HAVING COUNT(DISTINCT ANO)>=2 AND SUM(CASE WHEN SITUACAO='alcancada' THEN 1 ELSE 0 END)=0 AND SUM(CASE WHEN SITUACAO='nao_alcancada' THEN 1 ELSE 0 END)>0 ORDER BY failed DESC,COD_MUN LIMIT 25",p)
    if persistent:
        highlights.append(f"{len(persistent)} municípios listados apresentam observações negativas e nenhuma alcançada no recorte, com presença em pelo menos dois anos. Registros sem informação não são contados como fracasso.")
    if first and last and first['percentage'] is not None and last['percentage'] is not None:
        delta=last['percentage']-first['percentage']
        highlights.append(f"A proporção de observações município × indicador com meta alcançada variou {delta:+.1f} pontos percentuais entre {first['ANO']} e {last['ANO']}.")
    for id in sorted({s['INDICADOR'] for s in series}):
        values=[s for s in series if s['INDICADOR']==id and s['percentage'] is not None]
        if len(values)>1:
            x,y=values[0],values[-1]
            highlights.append(f"Indicador {id:02d}: {x['percentage']:.1f}% em {x['ANO']} e {y['percentage']:.1f}% em {y['ANO']}. Variação {y['percentage']-x['percentage']:+.1f} p.p.; consulte as mudanças de definição.")
    trends=[]
    for id in sorted({s['INDICADOR'] for s in series}):
        values=[s for s in series if s['INDICADOR']==id and s['percentage'] is not None]
        if not values: continue
        x,y=values[0],values[-1]; delta=y['percentage']-x['percentage']
        best=max(values,key=lambda s:s['percentage']); worst=min(values,key=lambda s:s['percentage'])
        municipal=[s for s in rows if s['INDICADOR']==id]
        trends.append({'indicator':id,'first':x,'last':y,'delta_pp':round(delta,2),'relative_percentage':round(100*delta/x['percentage'],2) if x['percentage'] else None,'maximum':best,'minimum':worst,'years_reached':sum(s['SITUACAO']=='alcancada' for s in municipal) if municipal else None,'years_failed':sum(s['SITUACAO']=='nao_alcancada' for s in municipal) if municipal else None})
    return {'persistent':persistent,'trends':trends,'rank_total':rank_total,'rank_page':rank_page,'series':series,'totals':totals,'ranking':ranking,'observations':rows,'changes':a.methodology(v),'highlights':highlights,'first':first,'last':last}


@app.get('/api/comparison')
def comparison(codes:str,year:int,v:str=Depends(version)):
    selected=list(dict.fromkeys(codes.split(',')))
    if not 1<=len(selected)<=5 or any(not re.fullmatch(r'\d{6,7}',c) for c in selected): raise HTTPException(422,'Selecione de 1 a 5 municípios válidos.')
    result=[]
    for code in selected:
        result+=observations({'year':year,'municipality':code},v,1,100)['rows']
    return {'rows':result}


@app.get('/api/export')
def export(f:dict=Depends(filters),v:str=Depends(version),format:str=Query('csv',pattern='^(csv|xlsx)$'),kind:str=Query('municipalities',pattern='^(municipalities|indicators|states|observations)$')):
    w,p=a.where(f)
    if kind=='municipalities':
        sql='SELECT ANO,UF,COD_MUN,NOME_MUN,POP_ANO,'+a.AGG+' FROM observations o'+w+' GROUP BY ANO,UF,COD_MUN,NOME_MUN,POP_ANO'
    elif kind in ['indicators','states']:
        rows=a.aggregate(v,f,kind); sql=None
    else:
        count=a.query(v,'SELECT COUNT(*) AS n FROM observations o'+w,p)[0]['n']
        if count>200000: raise HTTPException(422,'Limite de 200 mil observações por exportação. Restrinja o período ou território.')
        sql='SELECT o.*,d.DESCRICAO,d.LABEL_META FROM observations o JOIN definitions d ON d.ANO=o.ANO AND d.INDICADOR=o.INDICADOR'+w
    if sql: rows=a.query(v,sql,p)
    df=pd.DataFrame(rows)
    # Neutralize spreadsheet formulas in untrusted string cells.
    for c in df.select_dtypes(include='object'):
        df[c]=df[c].map(lambda x:"'"+x if isinstance(x,str) and x.startswith(('=','+','-','@','\t','\r')) else x)
    if format=='csv': data=df.to_csv(index=False,sep=';',decimal=',').encode('utf-8-sig'); media='text/csv'
    else:
        buf=io.BytesIO(); df.to_excel(buf,index=False); data=buf.getvalue(); media='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return StreamingResponse(io.BytesIO(data),media_type=media,headers={'Content-Disposition':f'attachment; filename="pqavs-{kind}.{format}"'})


@app.post('/api/admin/validar',dependencies=[Depends(admin)])
def validate(file:UploadFile=File(...)):
    if not (file.filename or '').lower().endswith('.xlsx'): raise HTTPException(422,'Envie um arquivo .xlsx.')
    content=file.file.read(40*1024*1024+1)
    if len(content)>40*1024*1024: raise HTTPException(413,'Limite de 40 MB por arquivo.')
    token=uuid4().hex; path=DATA/'staging'/f'{token}.xlsx'; path.write_bytes(content)
    report,_=inspect(path)
    if report['valid']:
        (DATA/'staging'/f'{token}.json').write_text(json.dumps({'filename':Path(file.filename).name,'report':report},ensure_ascii=False))
    else: path.unlink(missing_ok=True)
    return {'token':token if report['valid'] else None,'report':report,'mode':'Substituição integral da base ativa; versões anteriores preservadas.'}


class ImportRequest(BaseModel):
    token:str=Field(pattern=r'^[0-9a-f]{32}$')


class RollbackRequest(BaseModel):
    version:str=Field(pattern=r'^[0-9a-f]{32}$')


@app.post('/api/admin/importar',dependencies=[Depends(admin)])
def import_data(body:ImportRequest):
    path=DATA/'staging'/f'{body.token}.xlsx'; meta=path.with_suffix('.json')
    if not path.exists() or not meta.exists(): raise HTTPException(404,'Validação não encontrada. Valide o arquivo novamente.')
    try:
        info=json.loads(meta.read_text()); v,report=import_file(path,info['filename'])
    except ValueError as e: raise HTTPException(422,str(e)) from e
    path.unlink(missing_ok=True); meta.unlink(missing_ok=True)
    return {'version':v,'report':report}


@app.get('/api/admin/importacoes',dependencies=[Depends(admin)])
def imports():
    with registry.connect() as c:
        versions=[dict(r) for r in c.execute(text('SELECT * FROM versions ORDER BY created DESC')).mappings()]
        events=[dict(r) for r in c.execute(text('SELECT * FROM events ORDER BY id DESC')).mappings()]
    for row in versions: row['report']=json.loads(row['report'])
    return {'active':active_id(),'versions':versions,'events':events}


@app.post('/api/admin/rollback',dependencies=[Depends(admin)])
def rollback(body:RollbackRequest):
    with writer_lock():
        try: activate(body.version,'rollback')
        except ValueError as e: raise HTTPException(404,str(e)) from e
    return {'active':body.version}


# Mount last so every API route and the OpenAPI documentation keep priority.
mount_frontend(app)
