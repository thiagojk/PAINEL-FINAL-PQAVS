"""Optional browser smoke check against a running instance; no dataset activation."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
base=os.environ.get('PQAVS_BROWSER_URL','http://127.0.0.1:5173')
errors=[];results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('PQAVS_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.on('pageerror',lambda e: errors.append(str(e)))
 catalog=page.request.get(base+'/api/catalog').json()
 year=catalog['years'][-1]
 states=page.request.get(base+f'/api/dashboard?year={year}').json()['states']
 uf=max(states,key=lambda x:x['municipalities'])['UF']
 municipality=page.request.get(base+f'/api/municipios?year={year}&uf={uf}').json()['rows'][0]
 name=municipality['NOME_MUN']; code=municipality['COD_MUN']
 page.goto(base);page.get_by_text('Situação das metas',exact=True).wait_for(timeout=60000)
 results.append('Overview rendered with real data')
 page.get_by_label('Estado',exact=True).select_option(uf)
 page.get_by_text('Situação das metas',exact=True).wait_for();page.wait_for_timeout(700)
 assert f'uf={uf}' in page.url
 page.get_by_role('link',name='Estados',exact=True).click()
 page.get_by_text(f'Estado · {uf}',exact=True).wait_for(timeout=30000)
 page.get_by_label('Buscar na tabela').fill(name)
 page.get_by_role('button',name=name,exact=True).click()
 page.get_by_text('PERFIL MUNICIPAL',exact=True).wait_for(timeout=30000)
 assert f'municipality={code}' in page.url
 results.append('UF → municipality drill-down and persistent filters')
 page.get_by_role('button',name='Ver trajetória',exact=False).click()
 page.get_by_text('Trajetória municipal',exact=True).wait_for(timeout=60000)
 page.get_by_text('Evolução do cumprimento das metas',exact=True).wait_for()
 results.append('Municipality history rendered')
 page.goto(base+f'/historico?uf={uf}&indicator=6')
 page.get_by_text('Registro de mudanças metodológicas',exact=True).wait_for(timeout=60000)
 page.screenshot(path='/tmp/pqavs-history.png',full_page=True)
 results.append('Historical changes, charts and year comparison rendered')
 page.goto(base+f'/comparacoes?year={year}&uf={uf}')
 page.get_by_role('button',name='Adicionar',exact=True).first.wait_for(timeout=30000)
 page.get_by_role('button',name='Adicionar',exact=True).first.click()
 page.get_by_role('button',name='Adicionar',exact=True).nth(1).click()
 page.get_by_text('Resultado, meta e situação',exact=True).wait_for(timeout=30000)
 results.append('Two-municipality comparison rendered')
 page.goto(base+f'/dados?year={year}&uf={uf}')
 page.get_by_label('Próxima página').wait_for(timeout=30000);page.get_by_label('Próxima página').click()
 page.get_by_text('Página 2 de',exact=False).wait_for(timeout=30000)
 with page.expect_download() as download:page.get_by_role('button',name='CSV',exact=True).last.click()
 assert download.value.suggested_filename.endswith('.csv')
 results.append('Pagination and CSV download')
 page.goto(base+'/atualizar')
 page.get_by_label('Chave administrativa',exact=True).fill((root/'data/admin.key').read_text().strip())
 page.get_by_role('button',name='Consultar histórico').click();page.get_by_text('Histórico de importações',exact=True).wait_for(timeout=30000)
 page.get_by_label('Arquivo Excel').set_input_files({'name':'invalid.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':b'not excel'})
 page.get_by_role('button',name='Validar arquivo',exact=True).click();page.get_by_text('Arquivo inválido',exact=True).wait_for(timeout=30000)
 results.append('Administrative authentication, history and invalid upload report')
 for width in (1024,768,390):
  page.set_viewport_size({'width':width,'height':1000});page.goto(base+f'/?year={year}');page.get_by_text('Situação das metas',exact=True).wait_for(timeout=30000)
  overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
  assert not overflow, f'Page overflow at {width}'
  page.screenshot(path=f'/tmp/pqavs-{width}.png',full_page=False)
 results.append('Responsive layouts at 1024, 768 and 390 px without page overflow')
 browser.close()
print(json.dumps({'passed':results,'console_errors':errors},ensure_ascii=False,indent=2))
assert not errors
