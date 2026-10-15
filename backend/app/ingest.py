"""Inspect Excel without execution, validate and normalize preserving source semantics."""
import hashlib
import re
from pathlib import Path
import pandas as pd

TERRITORY = ['ANO', 'UF', 'COD_MUN', 'NOME_MUN', 'POP_ANO']
DICTIONARY = ['ANO', 'INDICADOR', 'DESCRICAO', 'LABEL_NUM', 'LABEL_DEN', 'LABEL_RES', 'LABEL_META']
SUFFIXES = ['NUM', 'DEN', 'RES', 'META', 'ALCANCE_META']
UF = set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())


def clean(frame):
    """Normalize explicit missing markers; preserve zero and source strings."""
    return frame.replace(r'^\s*(?:NULL|null|NA|N/A|NaN)?\s*$', None, regex=True)


def classify(meta, reach, result, defined=True, conflict=False):
    """Do not convert unknowns or contradictory source classifications into failures."""
    if not defined:
        return 'nao_aplicavel', 'Sem definição para este código/ano no dicionário.'
    if conflict:
        return 'sem_informacao', 'META e ALCANCE_META divergentes; requer revisão.'
    text = str(meta).strip().casefold()
    if text in ('não aplicável','nao aplicavel'):
        return 'nao_aplicavel', 'Não aplicabilidade explicitamente registrada na fonte.'
    if text in ('ausência de casos','ausencia de casos'):
        return 'ausencia_casos', 'Ausência de casos explicitamente registrada na fonte.'
    if text not in ('sim', 'não', 'nao'):
        return 'sem_informacao', 'Situação ausente ou referência técnica não resolvida.'
    if pd.isna(result) and text != 'sim':
        return 'sem_informacao', 'Resultado ausente; classificação negativa não usada automaticamente.'
    if text == 'sim' and reach == 1:
        return 'alcancada', 'Classificação explícita da fonte.'
    if text in ('não', 'nao') and reach == 0:
        return 'nao_alcancada', 'Classificação explícita da fonte, com resultado informado.'
    return 'sem_informacao', 'Codificação de alcance não reconhecida.'


def inspect(path: Path):
    """Read every sheet, collect actionable errors and build normalized observations."""
    report = {'valid': False, 'errors': [], 'warnings': [], 'sheets': [], 'years': [], 'rows': 0}
    try:
        # Bound decompressed XML to avoid workbook ZIP bombs before parsing.
        from zipfile import ZipFile
        with ZipFile(path) as z:
            if sum(x.file_size for x in z.infolist()) > 700_000_000:
                raise ValueError('Arquivo excede o limite descompactado de 700 MB.')
        sheets = pd.read_excel(path, sheet_name=None)
    except Exception:
        report['errors'].append('Não foi possível ler o Excel ou o arquivo excede os limites suportados.')
        return report, None
    report['sheets'] = [{'name': n, 'rows': len(d), 'columns': list(d.columns)} for n, d in sheets.items()]
    if 'Indicadores e Metas por Ano' not in sheets:
        report['errors'].append('Aba obrigatória ausente: Indicadores e Metas por Ano.')
        return report, None
    dictionary = clean(sheets.pop('Indicadores e Metas por Ano'))
    if not set(DICTIONARY) <= set(dictionary):
        report['errors'].append('Dicionário incompleto: faltam colunas obrigatórias.')
        return report, None
    dictionary = dictionary[DICTIONARY].copy()
    for c in ['ANO', 'INDICADOR']:
        dictionary[c] = pd.to_numeric(dictionary[c], errors='coerce')
        if dictionary[c].isna().any() or dictionary[c].mod(1).ne(0).any():
            report['errors'].append(f'Dicionário: {c} deve ser inteiro e não nulo.')
    if dictionary.isna().any().any():
        report['errors'].append('Dicionário contém campos críticos ausentes.')
    if dictionary.duplicated(['ANO', 'INDICADOR']).any():
        report['errors'].append('Dicionário com definições duplicadas por ano e indicador.')
    if report['errors']:
        return report, None
    dictionary[['ANO', 'INDICADOR']] = dictionary[['ANO', 'INDICADOR']].astype(int)
    definitions = {(int(x.ANO), int(x.INDICADOR)) for x in dictionary.itertuples()}
    territories, observations = [], []
    for name, source in sheets.items():
        match = re.fullmatch(r'PQA_VS_(\d{4})', name)
        if not match:
            report['warnings'].append(f'Aba {name} inspecionada, mas não é uma aba anual reconhecida.')
            continue
        year = int(match[1]); d = clean(source)
        if not set(TERRITORY) <= set(d):
            report['errors'].append(f'{name}: faltam colunas territoriais obrigatórias.'); continue
        for c in ['ANO', 'POP_ANO']:
            converted = pd.to_numeric(d[c], errors='coerce')
            if (d[c].notna() & converted.isna()).any() or converted.isin([float('inf'),-float('inf')]).any():
                report['errors'].append(f'{name}: {c} contém valores numéricos inválidos.')
            d[c] = converted
        if d[['ANO','UF','COD_MUN','NOME_MUN']].isna().any().any() or d.ANO.ne(year).any() or d.POP_ANO.lt(0).any():
            report['errors'].append(f'{name}: ano, território ou população inválidos.'); continue
        if d.POP_ANO.isna().any():
            report['warnings'].append(f'{year}: população ausente em {int(d.POP_ANO.isna().sum())} municípios; preservada como ausente.')
        if not set(d.UF) <= UF:
            report['errors'].append(f'{name}: UF inválida.'); continue
        codes = d.COD_MUN.astype(str).str.replace(r'\.0$', '', regex=True)
        if not codes.str.fullmatch(r'\d{6,7}').all():
            report['errors'].append(f'{name}: COD_MUN precisa ter 6 ou 7 dígitos.'); continue
        d['COD_MUN'] = codes
        if d.duplicated(['ANO', 'COD_MUN']).any():
            report['errors'].append(f'{name}: municípios duplicados no ano.'); continue
        ids = sorted({int(m[1]) for c in d for m in [re.fullmatch(r'IND_(\d+)_(?:NUM|DEN|RES|META|ALCANCE_META)', c)] if m})
        if not ids:
            report['errors'].append(f'{name}: nenhum indicador identificado.'); continue
        territories.append(d[TERRITORY].copy())
        for indicator in ids:
            prefix = f'IND_{indicator:02d}_'
            if any(prefix+s not in d for s in SUFFIXES):
                report['errors'].append(f'{name}: grupo {prefix} incompleto.'); continue
            part = d[TERRITORY].copy()
            part['INDICADOR'] = indicator
            for s, target in [('NUM','NUMERADOR'),('DEN','DENOMINADOR'),('RES','RESULTADO'),('META','META_FONTE'),('ALCANCE_META','ALCANCE_FONTE')]:
                part[target] = d[prefix+s]
            for c in ['NUMERADOR', 'DENOMINADOR', 'RESULTADO', 'ALCANCE_FONTE']:
                numeric = pd.to_numeric(part[c], errors='coerce')
                if (numeric.isna() & part[c].notna()).any() or numeric.isin([float('inf'),-float('inf')]).any():
                    report['errors'].append(f'{name}/{indicator}: {c} contém valores não numéricos.')
                part[c] = numeric
            if (~part.ALCANCE_FONTE.dropna().isin([0,1])).any():
                report['errors'].append(f'{name}/{indicator}: ALCANCE_META fora de 0/1.')
            defined = (year, indicator) in definitions
            metas = part.META_FONTE.astype(str).str.casefold()
            conflict = (metas.eq('sim') & part.ALCANCE_FONTE.eq(0)) | (metas.isin(['não','nao']) & part.ALCANCE_FONTE.eq(1))
            statuses = [classify(m,a,v,defined,c) for m,a,v,c in zip(part.META_FONTE,part.ALCANCE_FONTE,part.RESULTADO,conflict)]
            part['SITUACAO'] = [s[0] for s in statuses]; part['OBSERVACAO'] = [s[1] for s in statuses]
            part['CONFLITO'] = conflict.astype(int)
            if conflict.any(): report['warnings'].append(f'{year}/Indicador {indicator:02d}: {int(conflict.sum())} classificações divergentes.')
            if part.RESULTADO.isna().all(): report['warnings'].append(f'{year}/Indicador {indicator:02d}: todos os resultados ausentes.')
            if defined: observations.append(part)
            elif part[['NUMERADOR','DENOMINADOR','RESULTADO','ALCANCE_FONTE']].notna().any().any():
                report['errors'].append(f'{year}/Indicador {indicator}: dados sem definição no dicionário.')
        expected = set(dictionary.loc[dictionary.ANO.eq(year), 'INDICADOR'])
        if expected - set(ids): report['errors'].append(f'{year}: indicadores do dicionário ausentes na aba: {sorted(expected-set(ids))}.')
    if not territories or not observations:
        report['errors'].append('Nenhuma observação municipal válida encontrada.')
    if report['errors']: return report, None
    t = pd.concat(territories, ignore_index=True); o = pd.concat(observations, ignore_index=True)
    if t.duplicated(['ANO','COD_MUN']).any():
        report['errors'].append('Há anos/municípios duplicados entre abas.'); return report, None
    report.update(valid=True, years=sorted(int(y) for y in t.ANO.unique()), rows=len(o), municipalities=int(t.COD_MUN.nunique()), states=int(t.UF.nunique()), indicators=int(o.INDICADOR.nunique()), status_counts=o.SITUACAO.value_counts().to_dict(), conflicts=int(o.CONFLITO.sum()))
    absent = sorted(set(dictionary.ANO)-set(t.ANO))
    if absent: report['warnings'].append(f'Dicionário tem anos sem dados municipais: {absent}. Não entram nos filtros.')
    report['warnings'].append('Ausência de casos e não aplicabilidade individual não são deduzidas de denominador zero. Notas técnicas precisam de revisão.')
    return report, (t, o, dictionary)
