#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Orquestrador da atualização diária do Painel DEA — é isto que o cron chama.

DESENHO
-------
O `build_data.py` NÃO foi modificado na migração, de propósito: é ele que
garante que os números do servidor sejam idênticos aos do painel anterior.
Toda a adaptação ao servidor vive aqui.

    1. baixa a planilha        (drive_download.py, conta de serviço)
    2. roda o build_data.py    (sem tocar em nenhuma regra de negócio)
    3. confere a saída         (dados.js tem de ser JSON válido e não encolher)
    4. publica atomicamente    (os.replace, para o navegador nunca pegar meio arquivo)
    5. promove o estado        (snapshot e histórico só avançam se tudo deu certo)

ESTADO — LEIA ANTES DE MEXER
----------------------------
`snapshot-anterior.json` e `historico.json` são o que faz a aba "Alterações do
dia" comparar com o retrato certo, o que mantém a aba Histórico e o que faz o
contador de "dias na fila" da homologação existir. Eles só são promovidos no
passo 5, DEPOIS de a publicação dar certo. Se a rodada falhar no meio, o estado
antigo continua intacto e a próxima execução refaz a comparação sem perder nada.

NUNCA rode duas instâncias em paralelo (cron + execução manual ao mesmo tempo):
cada uma compararia com o próprio retrato e o histórico bifurcaria.
O lock em LOCK evita isso.

CONFIGURAÇÃO — ajuste os caminhos abaixo (ou use as variáveis de ambiente)
"""

import datetime
import fcntl
import json
import os
import shutil
import subprocess
import sys
import tempfile

# --------------------------------------------------------------------------
# Caminhos. Prefira definir por variável de ambiente no serviço/cron.
# --------------------------------------------------------------------------
BASE       = os.environ.get("DEA_BASE", "/opt/dea")
DIR_APP    = os.path.join(BASE, "app")           # build_data.py, drive_download.py
DIR_ESTADO = os.path.join(BASE, "estado")        # snapshot-anterior.json, historico.json
DIR_TRAB   = os.path.join(BASE, "trabalho")      # temporários da rodada
DIR_LOG    = os.path.join(BASE, "log")

# Pasta de onde o site serve os arquivos do painel.
# ATENÇÃO: tem de estar sob a MESMA autenticação da ferramenta "Exercícios
# Anteriores". Se o dados.js ficar num caminho público, a base inteira de
# pessoas fica acessível a quem souber a URL.
DIR_WEB    = os.environ.get("DEA_WEB", "/var/www/sispagpesbadm/exercicios-anteriores")

CREDENCIAL = os.environ.get("DEA_GOOGLE_CREDENCIAL", os.path.join(BASE, "credencial.json"))
FILE_ID    = os.environ.get("DEA_FILE_ID", "1mL_wHtnTRbA4Ng6M0exe-wNULVPfNfPLcJJCjxF1tlk")
LOCK       = os.path.join(BASE, ".atualizar.lock")

# Se a nova saída for menor que esta fração da anterior, aborta sem publicar.
# Protege contra o caso "planilha veio truncada/vazia" derrubar o painel.
FRACAO_MINIMA = 0.5

TZ = None
try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    TZ = datetime.timezone(datetime.timedelta(hours=-3), "America/Sao_Paulo")


def agora():
    return datetime.datetime.now(TZ).replace(tzinfo=None)


def log(msg):
    linha = "[%s] %s" % (agora().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(linha, flush=True)
    try:
        os.makedirs(DIR_LOG, exist_ok=True)
        with open(os.path.join(DIR_LOG, "atualizar.log"), "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass   # log é auxiliar; nunca derruba a rodada


def morre(msg):
    log("ERRO: " + msg)
    sys.exit(1)


def carregar_dados_js(caminho):
    """Valida que o dados.js é utilizável e devolve o objeto."""
    pref = "window.DEA_DATA="
    with open(caminho, encoding="utf-8") as f:
        raw = f.read()
    if not raw.startswith(pref):
        raise ValueError("dados.js não começa com '%s'" % pref)
    fim = raw.rstrip().rfind(";")
    if fim <= len(pref):
        raise ValueError("dados.js não termina com ';'")
    return json.loads(raw[len(pref):fim])


def main():
    os.makedirs(BASE, exist_ok=True)
    trava = open(LOCK, "w")
    try:
        fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        morre("já há uma atualização em andamento (lock em %s). Abortando." % LOCK)

    log("=== início da atualização ===")
    for d in (DIR_TRAB, DIR_ESTADO, DIR_WEB):
        os.makedirs(d, exist_ok=True)

    xlsx   = os.path.join(DIR_TRAB, "DEA.xlsx")
    prev   = os.path.join(DIR_ESTADO, "snapshot-anterior.json")
    hist   = os.path.join(DIR_ESTADO, "historico.json")
    saida  = os.path.join(DIR_TRAB, "out")
    shutil.rmtree(saida, ignore_errors=True)

    # ---- 1. baixar -------------------------------------------------------
    log("baixando a planilha...")
    r = subprocess.run(
        [sys.executable, os.path.join(DIR_APP, "drive_download.py"),
         "--file-id", FILE_ID, "--credencial", CREDENCIAL, "--saida", xlsx],
        capture_output=True, text=True)
    if r.returncode != 0:
        morre("download falhou:\n%s%s" % (r.stdout, r.stderr))
    log(r.stdout.strip())

    # ---- 2. build_data.py, intocado -------------------------------------
    log("processando...")
    cmd = [sys.executable, os.path.join(DIR_APP, "build_data.py"),
           "--xlsx", xlsx, "--outdir", saida, "--hist", hist]
    if os.path.exists(prev):
        cmd += ["--prev", prev]
    else:
        log("AVISO: sem snapshot anterior — esta rodada vira o ponto de partida "
            "(sem 'Alterações do dia' e com a fila em 'primeira leitura').")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        morre("build_data.py falhou:\n%s%s" % (r.stdout, r.stderr))
    for linha in r.stdout.strip().splitlines():
        log("  " + linha)
    if r.stderr.strip():
        log("  (stderr) " + r.stderr.strip())

    novo_js  = os.path.join(saida, "dados.js")
    novo_sn  = os.path.join(saida, "snapshot.json")
    novo_hi  = os.path.join(saida, "historico.json")
    for p in (novo_js, novo_sn, novo_hi):
        if not os.path.exists(p):
            morre("saída esperada não foi gerada: %s" % p)

    # ---- 3. conferir ------------------------------------------------------
    try:
        D = carregar_dados_js(novo_js)
    except Exception as e:
        morre("dados.js gerado é inválido: %s" % e)

    total = D.get("agregados", {}).get("total_processos", 0)
    if total < 1:
        morre("dados.js sem processos — planilha vazia ou corrompida. Nada publicado.")

    web_js = os.path.join(DIR_WEB, "dados.js")
    if os.path.exists(web_js):
        antes, depois = os.path.getsize(web_js), os.path.getsize(novo_js)
        if depois < antes * FRACAO_MINIMA:
            morre("o novo dados.js tem %d bytes contra %d do atual (< %.0f%%). "
                  "Isso costuma ser planilha truncada. Nada publicado."
                  % (depois, antes, FRACAO_MINIMA * 100))

    avisos = D.get("meta", {}).get("avisos", [])
    for a in avisos:
        log("AVISO DO PIPELINE: " + a)

    # ---- 4. publicar atomicamente ----------------------------------------
    # os.replace é atômico no mesmo sistema de arquivos: o navegador nunca pega
    # o arquivo pela metade. Por isso o temporário é criado dentro de DIR_WEB.
    fd, tmp = tempfile.mkstemp(dir=DIR_WEB, prefix=".dados-", suffix=".js")
    os.close(fd)
    shutil.copyfile(novo_js, tmp)
    os.chmod(tmp, 0o640)
    os.replace(tmp, web_js)
    log("publicado: %s (%d processos, %d bytes)" % (web_js, total, os.path.getsize(web_js)))

    # ---- 5. promover o estado --------------------------------------------
    # só agora, com a publicação já feita
    shutil.copyfile(novo_sn, prev)
    shutil.copyfile(novo_hi, hist)
    log("estado promovido: snapshot-anterior.json e historico.json")

    F = D.get("homolog", {})
    log("resumo: %s processos | %s grupos em risco | %s homologados p/ lançar | "
        "fila: %s (alerta: %s)"
        % (total, D["agregados"].get("grupos_risco"),
           D["agregados"].get("hl_total"),
           F.get("total"), "n/d" if F.get("primeira_vez") else len(F.get("alerta", []))))
    log("=== fim ===")


if __name__ == "__main__":
    main()
