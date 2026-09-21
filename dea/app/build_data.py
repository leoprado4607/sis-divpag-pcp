#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline de dados do Painel DEA - B Adm Gu Natal.

Lê a planilha "DEA" (8 abas de processos protocolados + aba Acompanhamento),
normaliza as situações, cruza protocolo a protocolo e produz:

  dados.js  -> window.DEA_DATA consumido pelo painel HTML
  snapshot.json -> retrato do dia, usado para o diff do dia seguinte

Uso:
  python3 build_data.py --xlsx DEA.xlsx --prev snapshot_anterior.json --outdir ./out
"""

import argparse, json, os, re, sys, unicodedata, datetime, hashlib
from collections import defaultdict, Counter

import openpyxl

# --------------------------------------------------------------------------
# Fuso horário
# --------------------------------------------------------------------------
# O container roda em UTC; a OM trabalha no horário de Brasília. Sem isto o
# painel carimbava "Atualizado em 13:09" para uma execução das 10:09 locais.
# O Brasil não tem horário de verão desde 2019, então o -03:00 fixo da reserva
# é seguro; ainda assim o zoneinfo vem primeiro, para acompanhar qualquer
# mudança futura de regra.
TZ_BRASILIA = None
try:
    from zoneinfo import ZoneInfo
    TZ_BRASILIA = ZoneInfo("America/Sao_Paulo")
except Exception:
    TZ_BRASILIA = datetime.timezone(datetime.timedelta(hours=-3), "America/Sao_Paulo")


def agora_local():
    """Data/hora de Brasília, sem tzinfo (para o isoformat sair sem o offset)."""
    return datetime.datetime.now(TZ_BRASILIA).replace(tzinfo=None)

ABAS_DEA = ["DEA 2019", "DEA 2020", "DEA 2021", "DEA 2022",
            "DEA 2023", "DEA 2024", "DEA 2025", "DEA 2026"]
ABA_ACOMP = "Acompanhamento"
ABA_HOMOLOG = "Protocolos para homologação"

# R$ - usada só para localizar pagamento de valor equivalente em outro ano (aba
# "Pago em outro ano"). Desde 21/09/2026 NÃO agrupa mais os protocolos: o
# agrupamento é por nome + Prec-cp + Nr BI (ver chave_grupo).
TOLERANCIA_VALOR = 50.00

# Nr BI exibido no grupo quando os protocolos não trazem BI na planilha
BI_AUSENTE = "???"

# --------------------------------------------------------------------------
# Normalização de situações
# --------------------------------------------------------------------------

def _slug(s):
    """minúsculas, sem acento, só alfanumérico -> chave de comparação."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# chave normalizada -> (código canônico, rótulo de exibição, classe de risco)
# classes: pago | rejeitado | excluido | andamento
MAPA_SITUACAO = {
    "pago": ("PAGO", "Pago", "pago"),
    # "Processado o Pagamento" não encerra o processo: o CPEx processou e a OM ainda
    # precisa lançar no SIPPES/SIAPPES. Só "Pago" significa crédito na conta.
    "processado o pagamento": ("PGTO_PROCESSADO", "Processado o Pagamento", "andamento"),

    "analisado e rejeitado restituido a om op": (
        "REJEITADO", "Analisado e Rejeitado / Restituído à OM/OP", "rejeitado"),
    "rejeitado no processamento": (
        "REJEITADO_PROC", "Rejeitado no Processamento", "rejeitado"),

    "processo excluido pelo operador": (
        "EXCLUIDO", "Processo Excluído pelo Operador", "excluido"),

    "protocolado e aguardando analise": (
        "AGUARDANDO_ANALISE", "Protocolado e Aguardando Análise", "andamento"),
    "protocolado e aguardando a documentacao arquivo digital": (
        "AGUARDANDO_DOC_DIGITAL", "Aguardando Documentação (Arquivo digital)", "andamento"),
    "protocolado e aguardando documentacao em papel": (
        "AGUARDANDO_DOC_PAPEL", "Aguardando Documentação em Papel", "andamento"),
    "analisado e aprovado aguardando pagamento": (
        "APROVADO_AGUARDANDO_PGTO", "Analisado e Aprovado / Aguardando Pagamento", "andamento"),
    "pagamento autorizado cpex aguardando lancamento da om no sippes": (
        "AUTORIZADO_CPEX", "Pagamento autorizado (CPEx) / Aguardando lançamento no SIPPES", "andamento"),
    "4 analisado aguardando envio pela dap para homologacao do cpex a om ainda nao devera efetuar o lancamento no sippes": (
        "AGUARDANDO_ENVIO_DAP", "Analisado / Aguardando envio pela DAP, para Homologação do CPEx", "andamento"),
    "4 analisado aguardando envio pela dap para homologacao": (
        "AGUARDANDO_ENVIO_DAP", "Analisado / Aguardando envio pela DAP, para Homologação do CPEx", "andamento"),
    "4 analisado aguardando homologacao do cpex a om ainda nao devera efetuar o lancamento no sippes": (
        "AGUARDANDO_HOMOLOGACAO", "Analisado / Aguardando Homologação do CPEx", "andamento"),
    "homologado pelo od do cpex efetuar lancamento no sippes ate o final da 2a corrida siappes automatico": (
        "HOMOLOGADO", "Homologado pelo OD do CPEx / Lançar no SIPPES", "andamento"),
}

# ordem de progressão do fluxo, para dizer se uma mudança avançou ou retrocedeu
ORDEM_FLUXO = {
    "AGUARDANDO_DOC_PAPEL": 1, "AGUARDANDO_DOC_DIGITAL": 1,
    "AGUARDANDO_ANALISE": 2,
    # mesma posição de AGUARDANDO_HOMOLOGACAO: são dois textos da etapa "4 -" do
    # sistema. Em 15/09/2026 os 17 processos que estavam em "Aguardando Homologação
    # do CPEx" passaram todos para este texto, sem sobrar nenhum no anterior — troca
    # de redação, não retrocesso. Empatados, a mudança entre os dois sai como lateral.
    "AGUARDANDO_ENVIO_DAP": 3,
    "AGUARDANDO_HOMOLOGACAO": 3,
    "HOMOLOGADO": 4,
    "APROVADO_AGUARDANDO_PGTO": 5,
    "AUTORIZADO_CPEX": 6,
    "PGTO_PROCESSADO": 7,
    "PAGO": 8,
    "REJEITADO": 0, "REJEITADO_PROC": 0, "EXCLUIDO": -1,
}

_desconhecidas = Counter()


def classificar(situacao_bruta):
    """-> dict(codigo, rotulo, classe, original). Nunca levanta exceção."""
    orig = "" if situacao_bruta is None else str(situacao_bruta).strip()
    chave = _slug(orig)
    if not chave:
        return {"codigo": "SEM_INFO", "rotulo": "Sem informação",
                "classe": "andamento", "original": orig}
    if chave in MAPA_SITUACAO:
        cod, rot, cls = MAPA_SITUACAO[chave]
        return {"codigo": cod, "rotulo": rot, "classe": cls, "original": orig}
    # heurística de reserva, para a planilha não quebrar o painel se surgir texto novo
    _desconhecidas[orig] += 1
    if "rejeit" in chave:
        cls, cod = "rejeitado", "REJEITADO_OUTRO"
    elif "exclu" in chave:
        cls, cod = "excluido", "EXCLUIDO_OUTRO"
    elif chave.startswith("pago") or "pagamento efetuado" in chave:
        cls, cod = "pago", "PAGO_OUTRO"
    else:
        cls, cod = "andamento", "ANDAMENTO_OUTRO"
    return {"codigo": cod, "rotulo": orig or "Sem informação",
            "classe": cls, "original": orig}


# --------------------------------------------------------------------------
# Leitura da planilha
# --------------------------------------------------------------------------

def segmento_de(prec_cp):
    """Veteranos = Prec-cp iniciado em 96; Pensionistas = 98; Ativa = os demais."""
    t = str(prec_cp or "")
    if t.startswith("96"):
        return "Veteranos"
    if t.startswith("98"):
        return "Pensionistas"
    return "Ativa"


def parse_valor(v):
    """'R$2.144,05' -> 2144.05 ; aceita número puro. Retorna None se não der."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^0-9,.\-]", "", str(v))
    if not s:
        return None
    # formato brasileiro: ponto = milhar, vírgula = decimal
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def fmt_brl(x):
    if x is None:
        return "—"
    return "R$ " + f"{x:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def txt(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def ler_planilha(caminho):
    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    nomes = [w.title for w in wb.worksheets]

    faltando = [a for a in ABAS_DEA + [ABA_ACOMP] if a not in nomes]
    if faltando:
        raise SystemExit("ERRO: abas ausentes na planilha: %s\nAbas encontradas: %s"
                         % (faltando, nomes))

    # ---- Acompanhamento: protocolo -> situação
    acomp = {}
    acomp_dup = 0
    for r in wb[ABA_ACOMP].iter_rows(min_row=2, values_only=True):
        if not r or r[0] is None:
            continue
        p = txt(r[0])
        if not p:
            continue
        if p in acomp:
            acomp_dup += 1
        acomp[p] = {"codom": txt(r[1]), "prec_cp": txt(r[2]),
                    "nome": txt(r[3]), "situacao": r[4]}

    # ---- abas DEA
    processos = []
    vistos = {}
    duplicados = []
    for aba in ABAS_DEA:
        ano_aba = int(aba.split()[-1])
        for idx, r in enumerate(wb[aba].iter_rows(min_row=2, values_only=True), start=2):
            if not r or r[0] is None:
                continue
            protocolo = txt(r[0])
            if not protocolo:
                continue

            data = r[1]
            if isinstance(data, datetime.datetime):
                ano = data.year
                data_iso = data.strftime("%Y-%m-%d")
                data_br = data.strftime("%d/%m/%Y")
            else:
                ano = ano_aba
                data_iso = data_br = ""

            if protocolo in vistos:
                duplicados.append({"protocolo": protocolo,
                                   "abas": [vistos[protocolo]["aba"], aba]})
                continue

            valor = parse_valor(r[5])
            sit_dea = classificar(r[6])
            a = acomp.get(protocolo)
            sit_ac = classificar(a["situacao"]) if a else None

            reg = {
                "protocolo": protocolo,
                "aba": aba,
                "ano": ano,
                "ano_aba": ano_aba,
                "ano_divergente": ano != ano_aba,
                "data_iso": data_iso,
                "data": data_br,
                "nr_bi": txt(r[2]),
                "prec_cp": txt(r[3]),
                "segmento": segmento_de(txt(r[3])),
                "nome": txt(r[4]),
                "valor": valor,
                "valor_fmt": fmt_brl(valor),
                "codom": txt(r[8]),
                "parecer": txt(r[7]),
                "sit_dea": sit_dea["rotulo"],
                "sit_dea_cod": sit_dea["codigo"],
                "sit_dea_classe": sit_dea["classe"],
                "tem_acomp": bool(a),
                "sit_acomp": sit_ac["rotulo"] if sit_ac else "",
                "sit_acomp_cod": sit_ac["codigo"] if sit_ac else "",
                "sit_acomp_classe": sit_ac["classe"] if sit_ac else "",
            }
            # situação efetiva: Acompanhamento manda; DEA é reserva
            reg["sit_efetiva"] = reg["sit_acomp"] or reg["sit_dea"]
            reg["sit_efetiva_cod"] = reg["sit_acomp_cod"] or reg["sit_dea_cod"]
            reg["sit_efetiva_classe"] = reg["sit_acomp_classe"] or reg["sit_dea_classe"]
            reg["divergente"] = bool(a) and reg["sit_acomp_cod"] != reg["sit_dea_cod"]
            if reg["divergente"]:
                de = ORDEM_FLUXO.get(reg["sit_dea_cod"])
                pa = ORDEM_FLUXO.get(reg["sit_acomp_cod"])
                reg["sentido"] = ("avanco" if (de is not None and pa is not None and pa > de)
                                  else "retrocesso" if (de is not None and pa is not None and pa < de)
                                  else "lateral")
            processos.append(reg)
            vistos[protocolo] = reg

    wb.close()

    # protocolos que só existem no Acompanhamento (outras OM / anos anteriores)
    so_acomp = [p for p in acomp if p not in vistos]

    return processos, acomp, so_acomp, duplicados, acomp_dup


# --------------------------------------------------------------------------
# Fila de homologação (aba "Protocolos para homologação")
# --------------------------------------------------------------------------

def ler_homologacao(caminho):
    """
    Lê a aba da fila de homologação. A aba NÃO tem coluna de data: o tempo de
    espera é medido pelo painel, guardando em `homolog_visto` a data em que cada
    protocolo foi visto ali pela primeira vez.

    Colunas (a coluna A é vazia):
      B Protocolo | C Tipo | D Unidade Gestora | E Codom Vinculado
      F Sigla Codom | G Prec-CP (vem vazia) | H Nome | I Valor Corrigido

    A aba pode não existir (foi criada em 19/09/2026); nesse caso devolve None,
    e o painel mostra a seção como indisponível em vez de quebrar.
    """
    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    if ABA_HOMOLOG not in [w.title for w in wb.worksheets]:
        wb.close()
        return None
    linhas = []
    for r in wb[ABA_HOMOLOG].iter_rows(min_row=2, values_only=True):
        if not r or len(r) < 2 or r[1] in (None, ""):
            continue
        def c(i):
            return txt(r[i]) if len(r) > i else ""
        linhas.append({
            "protocolo": c(1), "tipo": c(2), "ug": c(3),
            "codom_vinc": c(4), "sigla": c(5),
            "prec_cp_aba": c(6), "nome": c(7),
            "valor": parse_valor(r[8] if len(r) > 8 else None),
        })
    wb.close()
    return linhas


def _dias(iso_a, iso_b):
    """dias corridos entre duas datas AAAA-MM-DD (a - b). None se faltar alguma."""
    if not iso_a or not iso_b or len(iso_a) < 10 or len(iso_b) < 10:
        return None
    da = datetime.date(int(iso_a[:4]), int(iso_a[5:7]), int(iso_a[8:10]))
    db = datetime.date(int(iso_b[:4]), int(iso_b[5:7]), int(iso_b[8:10]))
    return (da - db).days


DIAS_ALERTA_FILA = 2   # a partir de quantos dias na fila o protocolo vira alerta


def analisar_homologacao(linhas, processos, anterior, data_ref):
    """
    Cruza a fila com as abas DEA pelo número do protocolo e devolve a estrutura
    consumida pelo painel. Dois relógios, por decisão do usuário (19/09/2026):

      dias_fila      - desde que o protocolo apareceu NESTA aba. É o que dispara
                       o alerta de >= DIAS_ALERTA_FILA. Só passa a valer da
                       segunda execução em diante, porque antes não há histórico.
      dias_protocolo - desde a Data Implantação das abas DEA. Serve de contexto:
                       por ele TODOS os 38 da primeira leitura já tinham >= 2 dias
                       (mediana 123, máximo 586), então ele não serve de alerta.
    """
    if linhas is None:
        return {"disponivel": False,
                "motivo": "A aba \"%s\" não foi encontrada na planilha." % ABA_HOMOLOG,
                "itens": [], "novos": [], "saidos": [], "alerta": [],
                "total": 0, "primeira_vez": False, "base": ""}

    idx = {p["protocolo"]: p for p in processos}
    ant_visto = (anterior or {}).get("homolog_visto") or {}
    ant_lista = (anterior or {}).get("homolog")
    primeira_vez = ant_lista is None          # snapshot anterior anterior à criação da aba
    ant_set = set(ant_lista or [])

    itens, visto_hoje = [], {}
    for l in linhas:
        proto = l["protocolo"]
        q = idx.get(proto)
        # quando já foi visto antes, preserva a data original; senão, entrou hoje
        primeira_vista = ant_visto.get(proto, data_ref)
        visto_hoje[proto] = primeira_vista
        prec = (q or {}).get("prec_cp", "") or l["prec_cp_aba"]
        item = {
            "protocolo": proto,
            "tipo": l["tipo"],
            "codom_vinc": l["codom_vinc"],
            "sigla": l["sigla"],
            "nome": l["nome"] or (q or {}).get("nome", ""),
            "valor": l["valor"],
            "valor_fmt": fmt_brl(l["valor"]),
            "prec_cp": prec,
            "segmento": segmento_de(prec),
            "no_dea": bool(q),
            "ano": (q or {}).get("ano", ""),
            "data": (q or {}).get("data", ""),
            "data_iso": (q or {}).get("data_iso", ""),
            "sit_dea": (q or {}).get("sit_dea", ""),
            "sit_acomp": (q or {}).get("sit_acomp", ""),
            "tem_acomp": bool((q or {}).get("tem_acomp")),
            "primeira_vista": primeira_vista,
            "dias_fila": None if primeira_vez else _dias(data_ref, primeira_vista),
            "dias_protocolo": _dias(data_ref, (q or {}).get("data_iso", "")),
            "novo": (not primeira_vez) and proto not in ant_set,
        }
        itens.append(item)

    # quem estava na fila e não está mais: saiu para homologação (ou foi excluído)
    atual = {i["protocolo"] for i in itens}
    saidos = []
    for proto in sorted(ant_set - atual):
        q = idx.get(proto, {})
        saidos.append({"protocolo": proto, "nome": q.get("nome", ""),
                       "valor_fmt": q.get("valor_fmt", ""),
                       "prec_cp": q.get("prec_cp", ""),
                       "segmento": q.get("segmento", "Ativa"),
                       "sit_dea": q.get("sit_dea", ""),
                       "sit_acomp": q.get("sit_acomp", "")})

    # mais antigo na fila primeiro; empate resolve pelo tempo de protocolo
    itens.sort(key=lambda i: (-(i["dias_fila"] or 0), -(i["dias_protocolo"] or 0), i["protocolo"]))
    novos = [i for i in itens if i["novo"]]
    alerta = [i for i in itens
              if i["dias_fila"] is not None and i["dias_fila"] >= DIAS_ALERTA_FILA]

    return {
        "disponivel": True,
        "motivo": "",
        "base": (anterior or {}).get("data", ""),
        "primeira_vez": primeira_vez,
        "limite_alerta": DIAS_ALERTA_FILA,
        "total": len(itens),
        "itens": itens,
        "novos": novos,
        "saidos": saidos,
        "alerta": alerta,
        "visto": visto_hoje,
        "sem_dea": len([i for i in itens if not i["no_dea"]]),
        "valor_total_fmt": fmt_brl(round(sum(i["valor"] or 0 for i in itens), 2)),
        "valor_alerta_fmt": fmt_brl(round(sum(i["valor"] or 0 for i in alerta), 2)),
    }


# --------------------------------------------------------------------------
# Análise principal "DEA pendente": mesmo nome + Prec-cp + Nr BI, 2+ protocolos
# --------------------------------------------------------------------------

def norm_bi(s):
    """
    Nr BI comparável: sem espaços, maiúsculo e sem zero à esquerda em cada
    número ("045/2026" == "45/2026", "BI 007" == "BI7").
    """
    s = re.sub(r"\s+", "", str(s or "")).upper()
    return re.sub(r"\d+", lambda m: str(int(m.group())), s)


def chave_grupo(p):
    """
    Regra do usuário (21/09/2026): agrupa protocolos de MESMO nome, MESMO
    Prec-cp e MESMO Nr BI, independentemente do valor. Sem Prec-cp ou sem
    nome fica fora (None). Sem Nr BI, agrupa pelo nome + Prec-cp entre os que
    também não têm BI (chave com BI vazio); o painel mostra o BI como "???".
    """
    nome, bi = _slug(p["nome"]), norm_bi(p["nr_bi"])
    if not p["prec_cp"] or not nome:
        return None
    return (nome, p["prec_cp"], bi)


def agrupar_repetidos(processos):
    """
    Devolve (mesmo_ano, entre_anos): listas de grupos (listas de processos)
    com 2+ protocolos na mesma chave. A chave que atravessa a virada do ano vai
    INTEIRA para "Entre anos" e não aparece na tela principal.
    """
    por_chave = defaultdict(list)
    for p in processos:
        k = chave_grupo(p)
        if k:
            por_chave[k].append(p)
    mesmo_ano, entre_anos = [], []
    for itens in por_chave.values():
        if len(itens) < 2:
            continue
        (entre_anos if len({i["ano"] for i in itens}) > 1 else mesmo_ano).append(itens)
    return mesmo_ano, entre_anos


def _faixa_valores(g):
    valores = [i["valor"] for i in g if i["valor"] is not None] or [0.0]
    return valores, round(sum(valores), 2)


def analisar_grupos(processos):
    """
    Regra do usuário:
      mesmo nome + mesmo Prec-cp + mesmo Nr BI + mesmo ano + 2 ou mais protocolos
      (qualquer valor).
      - se NENHUM do grupo está Pago  -> RISCO (rejeitado e ainda pendente)
      - se ALGUM está Pago            -> RESOLVIDO (corrigido e pago)
    A situação considerada é a da aba Acompanhamento; quando o protocolo não
    existe lá, usa-se a da aba DEA e o grupo é marcado como incerto.
    """
    grupos = []
    for g in agrupar_repetidos(processos)[0]:
        prec, ano = g[0]["prec_cp"], g[0]["ano"]
        valores, total = _faixa_valores(g)
        pagos = [i for i in g if i["sit_efetiva_classe"] == "pago"]
        rejeitados = [i for i in g if i["sit_efetiva_classe"] == "rejeitado"]
        andamento = [i for i in g if i["sit_efetiva_classe"] == "andamento"]
        excluidos = [i for i in g if i["sit_efetiva_classe"] == "excluido"]
        sem_ac = [i for i in g if not i["tem_acomp"]]

        if pagos:
            status, prioridade = "resolvido", 3
        elif rejeitados or andamento:
            # nenhum pago e há processo vivo -> é o caso que o painel existe para pegar
            status, prioridade = "risco", 1
        else:
            # só excluídos: não há pagamento pendente, mas também não houve pagamento
            status, prioridade = "atencao", 2

        grupos.append({
            "id": hashlib.md5(("|".join(sorted(i["protocolo"] for i in g))).encode()).hexdigest()[:10],
            "prec_cp": prec,
            "segmento": segmento_de(prec),
            "ano": ano,
            "nome": g[0]["nome"],
            "nomes": sorted({i["nome"] for i in g if i["nome"]}),
            "qtd": len(g),
            "protocolos": [i["protocolo"] for i in g],
            "valor_min": min(valores),
            "valor_max": max(valores),
            "amplitude": round(max(valores) - min(valores), 2),
            "amplitude_fmt": fmt_brl(round(max(valores) - min(valores), 2)),
            "valor_ref_fmt": fmt_brl(valores[0]),
            "valor_total": total,
            "valor_total_fmt": fmt_brl(total),
            "nr_bi": g[0]["nr_bi"] or BI_AUSENTE,
            "status": status,
            "prioridade": prioridade,
            "qtd_pago": len(pagos),
            "qtd_rejeitado": len(rejeitados),
            "qtd_andamento": len(andamento),
            "qtd_excluido": len(excluidos),
            "sem_acomp": len(sem_ac),
            "incerto": bool(sem_ac),
            "itens": [{
                "protocolo": i["protocolo"], "data": i["data"],
                "valor_fmt": i["valor_fmt"], "valor": i["valor"],
                "nome": i["nome"], "nr_bi": i["nr_bi"], "codom": i["codom"],
                "sit_dea": i["sit_dea"], "sit_acomp": i["sit_acomp"],
                "sit_efetiva": i["sit_efetiva"],
                "classe": i["sit_efetiva_classe"],
                "tem_acomp": i["tem_acomp"],
                "parecer": i["parecer"],
            } for i in sorted(g, key=lambda x: x["protocolo"])],
        })

    grupos.sort(key=lambda g: (g["prioridade"], -g["ano"], -g["qtd"], g["prec_cp"]))
    return grupos


def marcar_pagamento_outro_ano(processos, grupos):
    """
    Para cada grupo da tela "DEA pendente", procura um pagamento do MESMO Prec-cp em ANO
    DIFERENTE, com valor a no máximo R$50 de algum protocolo do grupo.

    A direção importa e não pode ser colapsada:
      - pagamento POSTERIOR  -> o processo foi rejeitado e o crédito saiu depois.
        O grupo deixa de ser pendência real.
      - pagamento ANTERIOR   -> alguém já recebeu antes e depois surgiram novas
        tentativas rejeitadas de valor parecido. Costuma ser outra dívida (outro
        período) que por acaso tem valor próximo, e NÃO comprova quitação.
    """
    por_prec = defaultdict(list)
    for p in processos:
        if p["prec_cp"]:
            por_prec[p["prec_cp"]].append(p)

    for g in grupos:
        # guarda a classificação pela regra do mesmo ano, antes de qualquer
        # reclassificação — é ela que diz se houve pagamento no PRÓPRIO ano
        g["status_ano"] = g["status"]
        g["sem_pagto_no_ano"] = g["status"] != "resolvido"
        g["resolvido_por"] = ""
        itens = g["itens"]
        pagos = []
        for q in por_prec.get(g["prec_cp"], []):
            if q["ano"] == g["ano"] or q["valor"] is None:
                continue
            if q["sit_efetiva_classe"] != "pago":
                continue
            if any(x["valor"] is not None and abs(q["valor"] - x["valor"]) <= TOLERANCIA_VALOR + 1e-9
                   for x in itens):
                pagos.append(q)
        if not pagos:
            g["pago_fora"] = None
            continue
        pagos.sort(key=lambda q: (q["data_iso"] or "", q["protocolo"]))
        anos = sorted({q["ano"] for q in pagos})
        if all(q["ano"] > g["ano"] for q in pagos):
            sentido = "posterior"
        elif all(q["ano"] < g["ano"] for q in pagos):
            sentido = "anterior"
        else:
            sentido = "misto"
        g["pago_fora"] = {
            "qtd": len(pagos),
            "sentido": sentido,
            "anos": anos,
            "anos_txt": ", ".join(str(a) for a in anos),
            "valor_fmt": fmt_brl(pagos[-1]["valor"]),
            "itens": pagos,
        }

        # Regra do indicador "Grupos em risco": um grupo cujo crédito saiu em ano
        # POSTERIOR não é mais pendência — sai do risco. Pagamento ANTERIOR não
        # comprova quitação (costuma ser outra dívida de valor parecido) e fica.
        if sentido == "posterior" and g["sem_pagto_no_ano"]:
            g["status"] = "resolvido"
            g["prioridade"] = 3
            g["resolvido_por"] = "ano_posterior"

    return grupos


MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
         "jul", "ago", "set", "out", "nov", "dez"]


def _rotulo_mes(iso):
    if not iso or len(iso) < 7:
        return "?"
    return "%s/%s" % (MESES[int(iso[5:7]) - 1], iso[0:4])


def analisar_grupos_entre_anos(processos):
    """
    O ciclo rejeição -> correção -> relançamento não respeita o ano civil:
    um processo rejeitado em outubro volta corrigido em janeiro seguinte.
    Aqui vale a mesma chave da tela "DEA pendente" (nome + Prec-cp + Nr BI)
    sem a trava do ano, e ficam apenas os grupos que ATRAVESSAM a virada —
    os de ano único aparecem na tela principal.
    """
    grupos = []
    for g in agrupar_repetidos(processos)[1]:
        prec = g[0]["prec_cp"]
        anos = sorted({i["ano"] for i in g})
        valores, total = _faixa_valores(g)
        pagos = [i for i in g if i["sit_efetiva_classe"] == "pago"]
        rejeitados = [i for i in g if i["sit_efetiva_classe"] == "rejeitado"]
        andamento = [i for i in g if i["sit_efetiva_classe"] == "andamento"]
        excluidos = [i for i in g if i["sit_efetiva_classe"] == "excluido"]
        sem_ac = [i for i in g if not i["tem_acomp"]]

        if pagos:
            status, prioridade = "resolvido", 3
        elif rejeitados or andamento:
            status, prioridade = "risco", 1
        else:
            status, prioridade = "atencao", 2

        ordenados = sorted(g, key=lambda x: (x["data_iso"] or "", x["protocolo"]))
        ini, fim = ordenados[0]["data_iso"], ordenados[-1]["data_iso"]
        meses = 0
        if ini and fim:
            meses = (int(fim[0:4]) - int(ini[0:4])) * 12 + (int(fim[5:7]) - int(ini[5:7]))

        grupos.append({
            "id": hashlib.md5(("X|" + "|".join(sorted(i["protocolo"] for i in g))).encode()).hexdigest()[:10],
            "prec_cp": prec,
            "segmento": segmento_de(prec),
            "ano": anos[-1],
            "anos": anos,
            "anos_txt": " → ".join(str(a) for a in anos),
            "intervalo": "%s → %s" % (_rotulo_mes(ini), _rotulo_mes(fim)),
            "meses": meses,
            "nome": g[0]["nome"],
            "nomes": sorted({i["nome"] for i in g if i["nome"]}),
            "qtd": len(g),
            "protocolos": [i["protocolo"] for i in g],
            "valor_min": min(valores),
            "valor_max": max(valores),
            "amplitude": round(max(valores) - min(valores), 2),
            "amplitude_fmt": fmt_brl(round(max(valores) - min(valores), 2)),
            "valor_ref_fmt": fmt_brl(valores[0]),
            "valor_total": total,
            "valor_total_fmt": fmt_brl(total),
            "nr_bi": g[0]["nr_bi"] or BI_AUSENTE,
            "status": status,
            "prioridade": prioridade,
            "qtd_pago": len(pagos),
            "qtd_rejeitado": len(rejeitados),
            "qtd_andamento": len(andamento),
            "qtd_excluido": len(excluidos),
            "sem_acomp": len(sem_ac),
            "incerto": bool(sem_ac),
            "itens": ordenados,
        })

    grupos.sort(key=lambda g: (g["prioridade"], -g["ano"], -g["qtd"], g["prec_cp"]))
    return grupos


# --------------------------------------------------------------------------
# Snapshot e diff do dia anterior
# --------------------------------------------------------------------------

def montar_snapshot(processos, data_ref, homolog=None):
    snap = {
        "data": data_ref,
        "acomp": {p["protocolo"]: p["sit_acomp_cod"] for p in processos if p["tem_acomp"]},
        "dea2026": {p["protocolo"]: p["sit_dea_cod"] for p in processos if p["ano"] == 2026},
        "protocolos": sorted(p["protocolo"] for p in processos),
    }
    # fila de homologação: a lista de hoje e a data em que cada protocolo foi
    # visto ali pela primeira vez. São esses dois campos que fazem o "dias na
    # fila" existir — a aba da planilha não traz data alguma.
    if homolog and homolog.get("disponivel"):
        snap["homolog"] = sorted(i["protocolo"] for i in homolog["itens"])
        # guarda só quem está na fila hoje, para o arquivo não crescer sem limite
        snap["homolog_visto"] = homolog["visto"]
    return snap


def calcular_diff(atual, anterior, processos):
    idx = {p["protocolo"]: p for p in processos}

    def rotulo(cod):
        for k, (c, r, _cl) in MAPA_SITUACAO.items():
            if c == cod:
                return r
        return cod or "Sem informação"

    if not anterior:
        return {"disponivel": False, "base": None,
                "motivo": "Primeira execução: não há retrato do dia anterior para comparar. "
                          "O retrato de hoje foi gravado e servirá de base a partir da próxima atualização.",
                "acomp": [], "dea2026": [], "novos": [], "removidos": [],
                "total": 0}

    mudancas = {"acomp": [], "dea2026": []}
    for campo in ("acomp", "dea2026"):
        ant, at = anterior.get(campo, {}), atual.get(campo, {})
        for proto, cod_at in at.items():
            cod_ant = ant.get(proto)
            if cod_ant is None or cod_ant == cod_at:
                continue
            p = idx.get(proto, {})
            de, para = ORDEM_FLUXO.get(cod_ant), ORDEM_FLUXO.get(cod_at)
            mudancas[campo].append({
                "protocolo": proto,
                "nome": p.get("nome", ""),
                "prec_cp": p.get("prec_cp", ""),
                "segmento": p.get("segmento", "Ativa"),
                "ano": p.get("ano"),
                "valor_fmt": p.get("valor_fmt", ""),
                "de": rotulo(cod_ant), "para": rotulo(cod_at),
                "de_cod": cod_ant, "para_cod": cod_at,
                "sentido": ("avanco" if (de is not None and para is not None and para > de)
                            else "retrocesso" if (de is not None and para is not None and para < de)
                            else "lateral"),
            })
        mudancas[campo].sort(key=lambda m: (m["sentido"] != "retrocesso", m["protocolo"]))

    ant_p = set(anterior.get("protocolos", []))
    at_p = set(atual.get("protocolos", []))
    novos = sorted(at_p - ant_p)
    removidos = sorted(ant_p - at_p)

    return {
        "disponivel": True,
        "base": anterior.get("data"),
        "motivo": "",
        "acomp": mudancas["acomp"],
        "dea2026": mudancas["dea2026"],
        "novos": [{"protocolo": p, "nome": idx.get(p, {}).get("nome", ""),
                   "segmento": idx.get(p, {}).get("segmento", "Ativa"),
                   "ano": idx.get(p, {}).get("ano"),
                   "valor_fmt": idx.get(p, {}).get("valor_fmt", ""),
                   "sit": idx.get(p, {}).get("sit_efetiva", "")} for p in novos],
        "removidos": [{"protocolo": p} for p in removidos],
        "total": len(mudancas["acomp"]) + len(mudancas["dea2026"]) + len(novos) + len(removidos),
    }


# --------------------------------------------------------------------------
# Histórico de atualizações
# --------------------------------------------------------------------------

MAX_ENTRADAS = 400     # ~1,5 ano de dias úteis
MAX_DETALHE  = 90      # entradas mais recentes que guardam a lista de mudanças


def atualizar_historico(caminho, diff, agregados, data_ref, gerado_em, gerado_em_iso):
    """
    Acumula uma entrada por EXECUÇÃO (não por dia): se o painel for regenerado
    duas vezes no mesmo dia, as duas ficam registradas e o painel agrupa por
    data. Substituir por dia perderia as mudanças da primeira execução, já que
    cada rodada compara com o retrato da anterior.
    """
    hist = []
    if caminho and os.path.exists(caminho):
        try:
            with open(caminho, encoding="utf-8") as f:
                hist = json.load(f)
            if not isinstance(hist, list):
                hist = []
        except Exception as e:
            print("AVISO: histórico ilegível (%s); começando um novo." % e, file=sys.stderr)
            hist = []

    entrada = {
        "id": gerado_em_iso,
        "data": data_ref,
        "gerado_em": gerado_em,
        "base": diff.get("base") or "",
        "disponivel": bool(diff.get("disponivel")),
        "total": diff.get("total", 0),
        "qtd_acomp": len(diff.get("acomp", [])),
        "qtd_dea2026": len(diff.get("dea2026", [])),
        "qtd_novos": len(diff.get("novos", [])),
        "qtd_removidos": len(diff.get("removidos", [])),
        "totais": {
            "processos": agregados["total_processos"],
            "risco": agregados["grupos_risco"],
            "ea_risco": agregados["ea_risco"],
            "homologados": agregados["hl_total"],
            "divergentes": agregados["divergentes"],
            "sem_acomp": agregados["sem_acompanhamento"],
        },
        "acomp": diff.get("acomp", []),
        "dea2026": diff.get("dea2026", []),
        "novos": diff.get("novos", []),
        "removidos": diff.get("removidos", []),
    }

    # não registra a execução que não teve base de comparação (1ª de todas):
    # ela não representa "o que mudou", só o ponto de partida
    if entrada["disponivel"]:
        hist = [h for h in hist if h.get("id") != entrada["id"]]
        hist.append(entrada)

    hist.sort(key=lambda h: (h.get("id") or "", h.get("data") or ""), reverse=True)
    hist = hist[:MAX_ENTRADAS]
    # entradas antigas mantêm só as contagens, para o arquivo não crescer sem limite
    for h in hist[MAX_DETALHE:]:
        for k in ("acomp", "dea2026", "novos", "removidos"):
            h[k] = []
        h["resumido"] = True
    return hist


# --------------------------------------------------------------------------
# Agregados
# --------------------------------------------------------------------------

def montar_agregados(processos, grupos, so_acomp):
    por_ano = defaultdict(lambda: {"total": 0, "pago": 0, "rejeitado": 0,
                                   "excluido": 0, "andamento": 0, "valor": 0.0})
    for p in processos:
        b = por_ano[p["ano"]]
        b["total"] += 1
        b[p["sit_efetiva_classe"]] += 1
        if p["valor"]:
            b["valor"] += p["valor"]

    anos = sorted(por_ano)
    series = [{"ano": a, **por_ano[a],
               "valor_fmt": fmt_brl(round(por_ano[a]["valor"], 2))} for a in anos]

    sit_counter = Counter(p["sit_efetiva"] for p in processos)
    classe_counter = Counter(p["sit_efetiva_classe"] for p in processos)

    sem_ac = [p for p in processos if not p["tem_acomp"]]
    divergentes = [p for p in processos if p["divergente"]]

    total_valor = sum(p["valor"] or 0 for p in processos)
    valor_rejeitado = sum(p["valor"] or 0 for p in processos
                          if p["sit_efetiva_classe"] == "rejeitado")
    valor_andamento = sum(p["valor"] or 0 for p in processos
                          if p["sit_efetiva_classe"] == "andamento")

    risco = [g for g in grupos if g["status"] == "risco"]

    return {
        "total_processos": len(processos),
        "anos": anos,
        "por_ano": series,
        "por_situacao": [{"rotulo": k, "qtd": v} for k, v in sit_counter.most_common()],
        "por_classe": dict(classe_counter),
        "valor_total": round(total_valor, 2),
        "valor_total_fmt": fmt_brl(round(total_valor, 2)),
        "valor_rejeitado_fmt": fmt_brl(round(valor_rejeitado, 2)),
        "valor_andamento_fmt": fmt_brl(round(valor_andamento, 2)),
        "sem_acompanhamento": len(sem_ac),
        "sem_acomp_por_situacao": [{"rotulo": k, "qtd": v} for k, v in
                                   Counter(p["sit_dea"] for p in sem_ac).most_common()],
        "divergentes": len(divergentes),
        "so_no_acompanhamento": len(so_acomp),
        "grupos_total": len(grupos),
        "grupos_risco": len(risco),
        "grupos_resolvido": len([g for g in grupos if g["status"] == "resolvido"]),
        "grupos_atencao": len([g for g in grupos if g["status"] == "atencao"]),
        "protocolos_em_risco": sum(g["qtd"] for g in risco),
        "valor_em_risco_fmt": fmt_brl(round(sum(
            i["valor"] or 0 for g in risco for i in g["itens"]
            if i["classe"] in ("rejeitado", "andamento")), 2)),
    }


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--prev", default=None, help="snapshot do dia anterior (JSON)")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--data-ref", default=None, help="AAAA-MM-DD (padrão: hoje)")
    ap.add_argument("--hist", default=None,
                    help="histórico acumulado de atualizações (JSON); é lido e reescrito")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    data_ref = args.data_ref or agora_local().date().isoformat()

    processos, acomp, so_acomp, duplicados, acomp_dup = ler_planilha(args.xlsx)
    grupos = marcar_pagamento_outro_ano(processos, analisar_grupos(processos))
    grupos_ea = analisar_grupos_entre_anos(processos)
    linhas_hl = ler_homologacao(args.xlsx)

    # ---- Homologados para lançamento -------------------------------------
    # O CPEx já autorizou/homologou o pagamento e a OM ainda precisa lançar no
    # SIPPES/SIAPPES. Enquanto não é pago, o protocolo não ganha situação de
    # pagamento na aba Acompanhamento.
    COD_HOMOLOGADO = ("AUTORIZADO_CPEX", "HOMOLOGADO")
    # Regra do usuário: entram TODOS os processos das abas DEA com essas duas
    # situações. O painel separa depois quem já tem pagamento registrado no
    # Acompanhamento — a coluna de situação das abas DEA não é atualizada após o
    # pagamento, então parte desta lista já foi paga e NÃO deve ser relançada.
    _todos_hom = [p for p in processos if p["sit_dea_cod"] in COD_HOMOLOGADO]
    homologados = sorted(
        [p for p in _todos_hom if p["sit_efetiva_classe"] != "pago"],
        key=lambda p: (p["data_iso"] or "", p["protocolo"]))
    homologados_pagos = [p for p in _todos_hom if p["sit_efetiva_classe"] == "pago"]

    # grupos sem pagamento no próprio ano, mas com pagamento em outro ano
    pagos_fora = [g for g in grupos if g["pago_fora"] and g["sem_pagto_no_ano"]]
    pf_post = [g for g in pagos_fora if g["pago_fora"]["sentido"] == "posterior"]
    pf_ant = [g for g in pagos_fora if g["pago_fora"]["sentido"] != "posterior"]

    anterior = None
    if args.prev and os.path.exists(args.prev):
        try:
            with open(args.prev, encoding="utf-8") as f:
                anterior = json.load(f)
        except Exception as e:
            print("AVISO: snapshot anterior ilegível (%s); diff ficará indisponível." % e,
                  file=sys.stderr)

    homolog = analisar_homologacao(linhas_hl, processos, anterior, data_ref)
    snapshot = montar_snapshot(processos, data_ref, homolog)
    diff = calcular_diff(snapshot, anterior, processos)
    agregados = montar_agregados(processos, grupos, so_acomp)

    agregados["hl_total"] = len(homologados)
    agregados["hl_ja_pagos"] = len(homologados_pagos)   # excluídos da aba, por regra
    agregados["hl_valor_fmt"] = fmt_brl(round(sum(p["valor"] or 0 for p in homologados), 2))
    agregados["hl_por_situacao"] = [
        {"rotulo": k, "qtd": v} for k, v in
        Counter(p["sit_dea"] for p in homologados).most_common()]
    agregados["hl_ja_pagos_por_situacao"] = [
        {"rotulo": k, "qtd": v} for k, v in
        Counter(p["sit_efetiva"] for p in homologados_pagos).most_common()]

    agregados["pf_total"] = len(pagos_fora)
    agregados["pf_posterior"] = len(pf_post)
    agregados["pf_anterior"] = len(pf_ant)
    agregados["pf_protocolos"] = sum(g["qtd"] for g in pf_post)
    # "grupos_risco" já vem líquido: os pagos em ano posterior foram reclassificados
    # antes da agregação. O bruto fica registrado para a linha de contexto do painel.
    agregados["grupos_risco_regra_ano"] = len([g for g in grupos if g["status_ano"] == "risco"])
    agregados["pf_risco_liquido"] = agregados["grupos_risco"]
    agregados["pf_resolvidos_tambem"] = len(
        [g for g in grupos if g["pago_fora"] and not g["sem_pagto_no_ano"]])

    risco_ea = [g for g in grupos_ea if g["status"] == "risco"]
    agregados["ea_total"] = len(grupos_ea)
    agregados["ea_risco"] = len(risco_ea)
    agregados["ea_atencao"] = len([g for g in grupos_ea if g["status"] == "atencao"])
    agregados["ea_resolvido"] = len([g for g in grupos_ea if g["status"] == "resolvido"])
    agregados["ea_protocolos_risco"] = sum(g["qtd"] for g in risco_ea)
    agregados["ea_precs_risco"] = len({g["prec_cp"] for g in risco_ea})
    agregados["ea_valor_risco_fmt"] = fmt_brl(round(sum(
        i["valor"] or 0 for g in risco_ea for i in g["itens"]
        if i["sit_efetiva_classe"] in ("rejeitado", "andamento")), 2))

    agregados["fh_total"] = homolog["total"]
    agregados["fh_novos"] = len(homolog["novos"])
    agregados["fh_alerta"] = len(homolog["alerta"])
    agregados["fh_saidos"] = len(homolog["saidos"])
    agregados["fh_disponivel"] = homolog["disponivel"]

    agora = agora_local()
    historico = atualizar_historico(
        args.hist, diff, agregados, data_ref,
        agora.strftime("%d/%m/%Y às %H:%M"), agora.isoformat(timespec="seconds"))

    dados = {
        "meta": {
            "gerado_em": agora.strftime("%d/%m/%Y às %H:%M"),
            "gerado_em_iso": agora.isoformat(timespec="seconds"),
            "data_ref": data_ref,
            "fonte": "Planilha DEA — Google Sheets",
            "organizacao": "Base Administrativa da Guarnição de Natal",
            "tolerancia_valor": TOLERANCIA_VALOR,
            "abas": ABAS_DEA,
            "avisos": ([] if not duplicados else
                       ["%d protocolo(s) repetido(s) entre abas foram ignorados na segunda ocorrência."
                        % len(duplicados)])
                      + ([] if not acomp_dup else
                         ["%d protocolo(s) repetido(s) na aba Acompanhamento; prevaleceu a última linha."
                          % acomp_dup])
                      + ([] if not _desconhecidas else
                         ["Situações não previstas no mapa: %s"
                          % "; ".join("%s (%d)" % (k[:60], v) for k, v in _desconhecidas.most_common(5))])
                      + ([] if not [p for p in processos if p["ano_divergente"]] else
                         ["%d processo(s) com ano da Data Implantação diferente do nome da aba; "
                          "prevaleceu a data." % len([p for p in processos if p["ano_divergente"]])]),
        },
        "agregados": agregados,
        "processos": processos,
        "grupos": grupos,
        "grupos_entre_anos": grupos_ea,
        "grupos_pagos_fora": pagos_fora,
        "homologados_idx": [],
        "diff": diff,
        "homolog": homolog,
        "historico": historico,
    }

    # ---- compactação: colunas + índices, em vez de repetir nomes de campo
    # 3.373 registros x ~25 chaves nominais pesam ~1 MB só de nome de campo.
    campos = ["protocolo", "ano", "data", "nr_bi", "prec_cp", "segmento", "nome", "valor",
              "valor_fmt", "codom", "parecer", "sit_dea", "sit_dea_cod",
              "sit_dea_classe", "tem_acomp", "sit_acomp", "sit_acomp_cod",
              "sit_acomp_classe", "sit_efetiva", "sit_efetiva_cod",
              "sit_efetiva_classe", "divergente", "sentido", "aba"]
    linhas = [[p.get(c, "") for c in campos] for p in processos]
    pos = {p["protocolo"]: i for i, p in enumerate(processos)}

    def compactar(lista):
        saida = []
        for g in lista:
            gc = {k: v for k, v in g.items() if k != "itens"}
            gc["idx"] = [pos[i["protocolo"]] for i in g["itens"]]
            pf = g.get("pago_fora")
            if pf:
                gc["pago_fora"] = {k: v for k, v in pf.items() if k != "itens"}
                gc["pago_fora"]["idx"] = [pos[i["protocolo"]] for i in pf["itens"]]
            saida.append(gc)
        return saida

    dados["homolog"] = {k: v for k, v in homolog.items() if k != "visto"}
    dados["campos"] = campos
    dados["processos"] = linhas
    dados["grupos"] = compactar(grupos)
    dados["grupos_entre_anos"] = compactar(grupos_ea)
    dados["grupos_pagos_fora"] = compactar(pagos_fora)
    dados["homologados_idx"] = [pos[p["protocolo"]] for p in homologados]

    with open(os.path.join(args.outdir, "dados.js"), "w", encoding="utf-8") as f:
        f.write("window.DEA_DATA=")
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";")
    with open(os.path.join(args.outdir, "snapshot.json"), "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(args.outdir, "historico.json"), "w", encoding="utf-8") as f:
        json.dump(historico, f, ensure_ascii=False, separators=(",", ":"))

    print("processos ............. %d" % len(processos))
    print("grupos DEA pendente ... %d  | risco: %d  resolvido: %d  atenção: %d"
          % (len(grupos), agregados["grupos_risco"],
             agregados["grupos_resolvido"], agregados["grupos_atencao"]))
    print("homologados p/ lançar . %d  (excluídos por já constarem \"Pago\": %d)"
          % (agregados["hl_total"], agregados["hl_ja_pagos"]))
    print("pago em outro ano ..... %d  | posterior: %d (%d protocolos)  anterior/misto: %d"
          % (agregados["pf_total"], agregados["pf_posterior"],
             agregados["pf_protocolos"], agregados["pf_anterior"]))
    print("   risco após excluir os pagos em ano posterior: %d (pela regra do ano seriam %d)"
          % (agregados["grupos_risco"], agregados["grupos_risco_regra_ano"]))
    print("entre anos ............ %d  | risco: %d (%d Prec-cp, %d protocolos)"
          % (len(grupos_ea), agregados["ea_risco"],
             agregados["ea_precs_risco"], agregados["ea_protocolos_risco"]))
    print("sem Acompanhamento .... %d" % agregados["sem_acompanhamento"])
    print("divergentes ........... %d" % agregados["divergentes"])
    print("alterações vs anterior. %s" % (diff["total"] if diff["disponivel"] else "n/d (1ª execução)"))
    if homolog["disponivel"]:
        print("fila de homologação ... %d na fila | novos: %s  alerta >=%dd: %s  saíram: %d"
              % (homolog["total"],
                 "n/d (1ª leitura)" if homolog["primeira_vez"] else len(homolog["novos"]),
                 DIAS_ALERTA_FILA,
                 "n/d (1ª leitura)" if homolog["primeira_vez"] else len(homolog["alerta"]),
                 len(homolog["saidos"])))
    else:
        print("fila de homologação ... indisponível: %s" % homolog["motivo"])
    print("histórico .............. %d execução(ões) registrada(s)" % len(historico))
    for a in dados["meta"]["avisos"]:
        print("AVISO:", a)
    print("saída ................. %s" % os.path.abspath(args.outdir))


if __name__ == "__main__":
    main()
