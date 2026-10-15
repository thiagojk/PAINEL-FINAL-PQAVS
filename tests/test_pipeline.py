"""Small synthetic workbooks exercise semantics, transactions and API boundaries."""
import importlib
import os
from pathlib import Path
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from backend.app.ingest import classify, inspect


def workbook(path:Path,year=2030,indicator=16,rows=None,definition=True):
    rows=rows or [
        {'ANO':year,'UF':'PA','COD_MUN':150140,'NOME_MUN':'Cidade A','POP_ANO':1000,'NUM':9,'DEN':10,'RES':.9,'META':'Sim','ALCANCE_META':1},
        {'ANO':year,'UF':'PA','COD_MUN':150150,'NOME_MUN':'Cidade B','POP_ANO':2000,'NUM':3,'DEN':10,'RES':.3,'META':'Não','ALCANCE_META':0},
        {'ANO':year,'UF':'AC','COD_MUN':120001,'NOME_MUN':'Cidade C','POP_ANO':None,'NUM':None,'DEN':0,'RES':None,'META':None,'ALCANCE_META':0}]
    normalized=[]
    for row in rows:
        normalized.append({(f'IND_{indicator:02d}_{k}' if k in ['NUM','DEN','RES','META','ALCANCE_META'] else k):v for k,v in row.items()})
    dictionary=pd.DataFrame([{'ANO':year,'INDICADOR':indicator,'DESCRICAO':'Indicador sintético','LABEL_NUM':'Numerador','LABEL_DEN':'Denominador','LABEL_RES':'Resultado','LABEL_META':'Meta >= 90%'}])
    with pd.ExcelWriter(path) as writer:
        dictionary.to_excel(writer,sheet_name='Indicadores e Metas por Ano',index=False)
        pd.DataFrame(normalized).to_excel(writer,sheet_name=f'PQA_VS_{year}',index=False)
    return path


@pytest.mark.parametrize('meta,reach,result,defined,conflict,expected',[
 ('Sim',1,.9,True,False,'alcancada'),('Não',0,.3,True,False,'nao_alcancada'),
 ('Não',0,None,True,False,'sem_informacao'),('Não',1,.2,True,True,'sem_informacao'),
 (None,0,None,True,False,'sem_informacao'),('Ver NT Nº 103/2021-CGIAE',0,.3,True,False,'sem_informacao'),
 ('Sim',1,None,True,False,'alcancada'),(0,None,None,False,False,'nao_aplicavel')])
def test_classification(meta,reach,result,defined,conflict,expected):
    assert classify(meta,reach,result,defined,conflict)[0]==expected


def test_dynamic_year_indicator_and_missing(tmp_path):
    report,frames=inspect(workbook(tmp_path/'test.xlsx'))
    assert report['valid'] and report['years']==[2030]
    t,o,d=frames
    assert len(o)==3 and o.INDICADOR.unique().tolist()==[16]
    assert o.SITUACAO.tolist()==['alcancada','nao_alcancada','sem_informacao']
    assert t.COD_MUN.iloc[0]=='150140'
    assert pd.isna(t.POP_ANO.iloc[-1])
    assert o.DENOMINADOR.iloc[-1]==0


def test_duplicate_is_rejected(tmp_path):
    path=workbook(tmp_path/'dup.xlsx');sheets=pd.read_excel(path,sheet_name=None)
    with pd.ExcelWriter(path) as w:
        for name,d in sheets.items():
            if name.startswith('PQA_'): d=pd.concat([d,d.iloc[:1]])
            d.to_excel(w,sheet_name=name,index=False)
    report,_=inspect(path)
    assert not report['valid'] and any('duplicados' in e for e in report['errors'])


def test_invalid_file(tmp_path):
    p=tmp_path/'bad.xlsx';p.write_text('not an excel file')
    assert not inspect(p)[0]['valid']


@pytest.fixture
def isolated(tmp_path,monkeypatch):
    monkeypatch.setenv('PQAVS_DATA_DIR',str(tmp_path/'data'))
    monkeypatch.setenv('PQAVS_ADMIN_TOKEN','synthetic-test-key')
    from backend.app import storage,analytics,main
    importlib.reload(storage);importlib.reload(analytics);importlib.reload(main)
    with TestClient(main.app) as client: yield client,storage,tmp_path


def test_api_aggregations_export_history_and_filters(isolated):
    client,store,p=isolated
    store.import_file(workbook(p/'test.xlsx'),'test.xlsx')
    data=client.get('/api/dashboard?year=2030').json()
    assert data['summary']['reached']==1 and data['summary']['failed']==1
    assert data['summary']['unknown']==1 and data['summary']['percentage']==50
    assert data['summary']['evaluated_municipalities']==2
    state=client.get('/api/dashboard?year=2030&uf=PA').json()['summary']
    assert state['municipalities']==2 and state['percentage']==50
    assert client.get('/api/dashboard?year=2030&pop_min=1500').json()['summary']['municipalities']==1
    assert client.get('/api/municipios?page_size=1').json()['total']==3
    assert len(client.get('/api/municipios?page_size=1').json()['rows'])==1
    assert client.get('/api/municipios?page_size=101').status_code==422
    assert client.get('/api/observations?municipality=150140').json()['rows'][0]['NUMERADOR']==9
    h=client.get('/api/history?indicator=16').json()
    assert h['series'][0]['ANO']==2030 and h['series'][0]['percentage']==50
    assert client.get('/api/export?year=2030&format=csv').status_code==200
    x=client.get('/api/export?year=2030&format=xlsx')
    assert x.content[:2]==b'PK'
    assert client.get('/api/comparison?codes=150140,150150&year=2030').json()['rows'][0]['ANO']==2030
    assert client.get('/api/comparison?codes=../bad&year=2030').status_code==422


def test_validation_does_not_import_and_rollback(isolated):
    client,store,p=isolated;headers={'X-Admin-Token':'synthetic-test-key'}
    first,_=store.import_file(workbook(p/'first.xlsx',2029),'first.xlsx')
    assert client.post('/api/admin/validar',files={'file':('test.xlsx',b'bad')}).status_code==401
    new=workbook(p/'new.xlsx',2031,17)
    with new.open('rb') as f: validation=client.post('/api/admin/validar',headers=headers,files={'file':('new.xlsx',f)}).json()
    assert validation['report']['valid'] and store.active_id()==first
    result=client.post('/api/admin/importar',headers=headers,json={'token':validation['token']})
    assert result.status_code==200 and store.active_id()!=first
    assert client.get('/api/catalog').json()['years']==[2031]
    assert client.get('/api/catalog').json()['definitions'][0]['INDICADOR']==17
    assert (store.DATA/'originals'/f'{first}.xlsx').exists()
    assert client.post('/api/admin/rollback',headers=headers,json={'version':first}).status_code==200
    assert client.get('/api/catalog').json()['years']==[2029]
    bad=client.post('/api/admin/validar',headers=headers,files={'file':('bad.xlsx',b'bad')}).json()
    assert not bad['report']['valid'] and bad['token'] is None
    history=client.get('/api/admin/importacoes',headers=headers).json()
    assert len(history['versions'])==2 and history['events'][0]['action']=='rollback'
    assert store.active_id()==first


def test_method_changes_and_multiyear_trends(isolated):
    client,store,p=isolated
    first=pd.read_excel(workbook(p/'a.xlsx',2030),sheet_name=None)
    second=pd.read_excel(workbook(p/'b.xlsx',2031),sheet_name=None)
    second['Indicadores e Metas por Ano']['LABEL_META']='Meta >= 95%'
    second['Indicadores e Metas por Ano']['DESCRICAO']='Definição nova'
    path=p/'multi.xlsx'
    with pd.ExcelWriter(path) as w:
        pd.concat([first.pop('Indicadores e Metas por Ano'),second.pop('Indicadores e Metas por Ano')]).to_excel(w,sheet_name='Indicadores e Metas por Ano',index=False)
        for name,frame in {**first,**second}.items():frame.to_excel(w,sheet_name=name,index=False)
    store.import_file(path,'multi.xlsx')
    h=client.get('/api/history?municipality=150150&indicator=16&level=municipality').json()
    assert len(h['changes'])==1 and h['changes'][0]['year']==2031
    assert h['changes'][0]['previous']['LABEL_META']=='Meta >= 90%'
    assert h['trends'][0]['years_failed']==2 and h['trends'][0]['years_reached']==0
    assert h['trends'][0]['relative_percentage'] is None
    assert h['persistent'][0]['COD_MUN']=='150150'
    assert h['rank_total']==1
    assert [r['ANO'] for r in h['series']]==[2030,2031]


def test_explicit_case_absence_not_zero_inference():
    assert classify('Ausência de casos',None,None)[0]=='ausencia_casos'
    assert classify('Não aplicável',None,None)[0]=='nao_aplicavel'
    assert classify('Não',0,0)[0]=='nao_alcancada'
