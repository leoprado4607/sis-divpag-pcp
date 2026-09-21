#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Confere se o pacote do Painel DEA chegou íntegro ao servidor.

Rode a partir da raiz do pacote, ANTES de começar a migração:

    python3 testes/verificar_pacote.py

Verifica presença dos arquivos, se os scripts compilam, se os parâmetros de
negócio são os documentados, se o painel está inteiro, se o estado tem as chaves
que o relógio da fila precisa, e se o dados.js de referência bate com os números
do docs/RETRATO-ATUAL.md.
"""
import hashlib
import json
import os
import py_compile
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
ok = True


def chk(cond, msg):
    global ok
    print(("  OK    " if cond else "  FALHA ") + msg)
    if not cond:
        ok = False


print("Verificando o pacote em %s\n" % RAIZ)

print("[1] arquivos presentes")
for f in ["LEIA-PRIMEIRO.md", "app/build_data.py", "app/painel.html", "app/dados.js",
          "app/drive_download.py", "app/atualizar.py", "estado/snapshot-anterior.json",
          "estado/historico.json", "docs/NOTAS-DOMINIO.md", "docs/IDENTIDADE-VISUAL.md",
          "docs/RETRATO-ATUAL.md", "testes/comparar_saidas.py"]:
    chk(os.path.exists(f), f)

print("\n[2] scripts compilam")
for f in ["app/build_data.py", "app/drive_download.py", "app/atualizar.py",
          "testes/comparar_saidas.py"]:
    try:
        py_compile.compile(f, doraise=True)
        chk(True, f)
    except Exception as e:
        chk(False, "%s -> %s" % (f, e))

print("\n[3] parâmetros de negócio (não devem ter sido alterados)")
s = open("app/build_data.py", encoding="utf-8").read()
chk("TOLERANCIA_VALOR" not in s and "def chave_grupo" in s, "agrupamento por nome + Prec-cp + Nr BI, sem referência de valor (desde 21/09/2026)")
chk("DIAS_ALERTA_FILA = 2" in s, "alerta da fila = 2 dias")
chk("MAX_ENTRADAS = 400" in s, "histórico limitado a 400 execuções")
chk("America/Sao_Paulo" in s, "fuso horário de Brasília")
chk('ABA_HOMOLOG = "Protocolos para homologa' in s, "lê a aba da fila de homologação")
chk('"processado o pagamento": ("PGTO_PROCESSADO", "Processado o Pagamento", "andamento")' in s,
    '"Processado o Pagamento" continua como ANDAMENTO, não como pago')

print("\n[4] painel")
h = open("app/painel.html", encoding="utf-8").read()
chk(h.rstrip().endswith("</body></html>"), "arquivo completo")
chk('<script src="dados.js"></script>' in h, "carrega dados.js como arquivo irmão")
chk(h.count('role="tab"') == 9, "9 abas")
chk("data:image/webp;base64" in h, "brasão embutido, sem dependência externa")
chk(not re.search(r">\s*Copiar CSV\s*<", h), "sem botões Copiar CSV")

print("\n[5] estado (o que dá memória ao painel)")
sn = json.load(open("estado/snapshot-anterior.json", encoding="utf-8"))
chk(sn.get("data") == "2026-09-19", "snapshot de 2026-09-19")
for k in ("acomp", "dea2026", "protocolos", "homolog", "homolog_visto"):
    chk(k in sn, "snapshot tem '%s' (%d itens)" % (k, len(sn.get(k, []))))
hi = json.load(open("estado/historico.json", encoding="utf-8"))
chk(len(hi) == 4, "histórico com 4 execuções")

print("\n[6] dados.js de referência")
raw = open("app/dados.js", encoding="utf-8").read()
D = json.loads(raw[len("window.DEA_DATA="):raw.rstrip().rfind(";")])
ag = D["agregados"]
for k, v in [("total_processos", 3421), ("grupos_risco", 82), ("ea_risco", 14),
             ("hl_total", 15), ("divergentes", 149), ("sem_acompanhamento", 227)]:
    chk(ag.get(k) == v, "%s = %s" % (k, v))
chk(D["homolog"]["total"] == 38, "fila de homologação = 38")
dig = lambda xs: hashlib.sha256("|".join(sorted(xs)).encode()).hexdigest()[:16]
chk(dig(g["id"] for g in D["grupos"]) == "af1cf4d7618b8e95", "impressão digital dos grupos")
chk(dig(g["id"] for g in D["grupos_entre_anos"]) == "b3f7ad95b92d3f6c",
    "impressão digital dos grupos entre anos")

print("\n" + ("PACOTE ÍNTEGRO — pode seguir com a migração."
              if ok else "*** HÁ FALHAS ACIMA — não siga antes de resolver. ***"))
sys.exit(0 if ok else 1)
