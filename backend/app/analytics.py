"""Server-side SQL filters, pagination and aggregates. Unknown statuses stay separate."""
import json
from functools import lru_cache
import pandas as pd
from sqlalchemy import text
from .storage import dataset


def query(version, sql, params=None):
    engine=dataset(version)
    try:
        with engine.connect() as c:
            rows=c.execute(text(sql),params or {}).mappings().all()
            return [dict(r) for r in rows]
    finally: engine.dispose()


def where(filters, alias='o'):
    clauses=[]; params={}
    for key,column in [('year','ANO'),('uf','UF'),('municipality','COD_MUN'),('indicator','INDICADOR'),('status','SITUACAO')]:
        if filters.get(key) not in (None,''):
            clauses.append(f'{alias}.{column}=:{key}'); params[key]=filters[key]
    for key,op,column in [('start','>=','ANO'),('end','<=','ANO'),('pop_min','>=','POP_ANO'),('pop_max','<=','POP_ANO')]:
        if filters.get(key) is not None:
            clauses.append(f'{alias}.{column}{op}:{key}'); params[key]=filters[key]
    if filters.get('search'):
        clauses.append(f'({alias}.NOME_MUN LIKE :search OR {alias}.COD_MUN LIKE :search)'); params['search']='%'+filters['search']+'%'
    return (' WHERE '+' AND '.join(clauses) if clauses else ''),params

AGG="""COUNT(*) AS total,
COUNT(DISTINCT COD_MUN) AS municipalities,
COUNT(DISTINCT CASE WHEN SITUACAO IN ('alcancada','nao_alcancada') THEN COD_MUN END) AS evaluated_municipalities,
SUM(CASE WHEN SITUACAO='alcancada' THEN 1 ELSE 0 END) AS reached,
SUM(CASE WHEN SITUACAO='nao_alcancada' THEN 1 ELSE 0 END) AS failed,
SUM(CASE WHEN SITUACAO NOT IN ('alcancada','nao_alcancada') THEN 1 ELSE 0 END) AS unknown,
SUM(CONFLITO) AS conflicts, COUNT(DISTINCT INDICADOR) AS indicators,
ROUND(100.0*SUM(CASE WHEN SITUACAO='alcancada' THEN 1 ELSE 0 END)/NULLIF(SUM(CASE WHEN SITUACAO IN ('alcancada','nao_alcancada') THEN 1 ELSE 0 END),0),2) AS percentage"""


def aggregate(version, filters, group=None):
    w,p=where(filters)
    groups={'states':'UF','indicators':'ANO, INDICADOR','years':'ANO','heatmap':'UF,INDICADOR','state_history':'ANO,UF','municipality_history':'ANO,COD_MUN,NOME_MUN,UF'}
    g=groups.get(group)
    return query(version,f'SELECT {g+"," if g else ""}{AGG} FROM observations o{w}'+(f' GROUP BY {g} ORDER BY {g}' if g else ''),p)


def definitions(version):
    return query(version,'SELECT * FROM definitions ORDER BY ANO,INDICADOR')


def methodology(version):
    rows=definitions(version); prev={}; changes=[]
    for d in rows:
        id=d['INDICADOR']; old=prev.get(id)
        fields=['DESCRICAO','LABEL_NUM','LABEL_DEN','LABEL_RES','LABEL_META']
        if old and any(old[f]!=d[f] for f in fields):
            changes.append({'year':d['ANO'],'indicator':id,'previous':old,'current':d,'fields':[f for f in fields if old[f]!=d[f]]})
        prev[id]=d
    return changes


def territorial_rows(version,filters,page=1,size=25,sort='percentage',direction='desc',group='municipality'):
    w,p=where(filters)
    g='ANO,COD_MUN,NOME_MUN,UF,POP_ANO' if group=='municipality' else 'UF'
    cols={'percentage','reached','failed','municipalities','UF','NOME_MUN','POP_ANO','ANO','unknown'}
    if sort not in cols or (group!='municipality' and sort in {'NOME_MUN','POP_ANO','ANO'}): sort='percentage'
    order='ASC' if direction=='asc' else 'DESC'
    base=f'SELECT {g},{AGG} FROM observations o{w} GROUP BY {g}'
    count=query(version,f'SELECT COUNT(*) AS count FROM ({base})',p)[0]['count']
    p.update(limit=size,offset=(page-1)*size)
    rows=query(version,base+f' ORDER BY {sort} {order}, '+('COD_MUN' if group=='municipality' else 'UF')+' ASC LIMIT :limit OFFSET :offset',p)
    return {'rows':rows,'total':count,'page':page,'page_size':size}


@lru_cache(maxsize=128)
def dashboard_cached(version,serialized):
    f=json.loads(serialized)
    return {'summary':{**aggregate(version,f)[0],**population(version,f)},'indicators':aggregate(version,f,'indicators'),'states':aggregate(version,f,'states'),'heatmap':aggregate(version,f,'heatmap')}


def population(version,filters):
    """Population counted once per municipality, at the latest selected year."""
    w,p=where(filters)
    sql=f'''WITH selected AS (SELECT ANO,COD_MUN,MAX(POP_ANO) population FROM observations o{w} GROUP BY ANO,COD_MUN)
    SELECT SUM(population) population,SUM(CASE WHEN population IS NULL THEN 1 ELSE 0 END) missing_population,
    COUNT(*) population_municipalities,MAX(ANO) population_year FROM selected WHERE ANO=(SELECT MAX(ANO) FROM selected)'''
    return query(version,sql,p)[0]


def historical_ranking(version,filters,page=1):
    w,p=where(filters)
    # Select 25 municipalities on the server before returning their annual aggregates.
    cte=f'WITH annual AS (SELECT ANO,COD_MUN,NOME_MUN,UF,{AGG} FROM observations o{w} GROUP BY ANO,COD_MUN,NOME_MUN,UF)'
    count=query(version,cte+' SELECT COUNT(DISTINCT COD_MUN) count FROM annual',p)[0]['count']
    p.update(limit=25,offset=(page-1)*25)
    selected=cte+''', chosen AS (SELECT COD_MUN,AVG(percentage) avg FROM annual GROUP BY COD_MUN ORDER BY avg DESC,COD_MUN LIMIT :limit OFFSET :offset)
    SELECT a.* FROM annual a JOIN chosen c ON c.COD_MUN=a.COD_MUN ORDER BY c.avg DESC,a.COD_MUN,a.ANO'''
    return query(version,selected,p),count
