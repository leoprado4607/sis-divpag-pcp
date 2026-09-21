#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ponte entre o pipeline do Painel DEA e o bucket PRIVADO do Supabase.

O pacote original pressupõe um servidor com disco (/opt/dea, /var/www/...). O site
roda na Vercel, sem disco persistente, então o que era disco vira o bucket
privado "dea-privado":

    publicado/dados.js              o que o site entrega (via /api/dea, com sessão)
    estado/snapshot-anterior.json   memória do painel — NÃO REGENERÁVEL
    estado/historico.json           memória do painel — NÃO REGENERÁVEL
    backup/AAAA-MM-DD/...           cópia diária do estado (backup pedido no pacote)

O atualizar.py do pacote roda SEM alteração entre o `baixar` e o `enviar`:

    supabase_sync.py baixar   ->  bucket  ->  $DEA_BASE/estado + $DEA_WEB/dados.js
    atualizar.py              ->  (intocado) processa e promove o estado localmente
    supabase_sync.py enviar   ->  dados.js primeiro, estado depois, e o backup

Só a biblioteca padrão. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEA_BASE, DEA_WEB.

Uso manual (uma vez, na virada):
    python dea/supabase_sync.py criar-bucket
    python dea/supabase_sync.py semear --estado <pasta com os 2 json> --dados <dados.js>
"""

import argparse
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

BUCKET = "dea-privado"
ESTADO = ["snapshot-anterior.json", "historico.json"]


def cfg():
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        sys.exit("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")
    return url, key


def req(metodo, caminho, corpo=None, tipo="application/octet-stream", extra=None):
    url, key = cfg()
    h = {"Authorization": "Bearer " + key, "apikey": key}
    if corpo is not None:
        h["Content-Type"] = tipo
    h.update(extra or {})
    r = urllib.request.Request(url + caminho, data=corpo, method=metodo, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def baixar_obj(nome):
    # Parâmetro único + no-cache: o CDN do Storage já entregou cópia antiga de
    # objeto sobrescrito (21/09/2026). Estado velho aqui bifurcaria o histórico.
    st, corpo = req("GET", "/storage/v1/object/%s/%s?v=%d" % (BUCKET, nome, time.time_ns()),
                    extra={"Cache-Control": "no-cache"})
    if st == 200:
        return corpo
    # O Storage responde 400/404 com "not_found" para objeto inexistente.
    baixo = corpo.lower()
    if st == 404 or (st == 400 and b"not" in baixo and b"found" in baixo):
        return None
    sys.exit("ERRO ao baixar %s: HTTP %s %s" % (nome, st, corpo[:200]))


def enviar_obj(nome, dados, tipo):
    st, corpo = req("POST", "/storage/v1/object/%s/%s" % (BUCKET, nome), dados, tipo,
                    {"x-upsert": "true", "Cache-Control": "no-store"})
    if st not in (200, 201):
        sys.exit("ERRO ao enviar %s: HTTP %s %s" % (nome, st, corpo[:200]))
    print("enviado: %s (%d bytes)" % (nome, len(dados)))


def dirs():
    base = os.environ.get("DEA_BASE")
    web = os.environ.get("DEA_WEB")
    if not base or not web:
        sys.exit("ERRO: defina DEA_BASE e DEA_WEB (os mesmos do atualizar.py).")
    return os.path.join(base, "estado"), web


def cmd_baixar(a):
    d_estado, d_web = dirs()
    os.makedirs(d_estado, exist_ok=True)
    os.makedirs(d_web, exist_ok=True)
    faltando = []
    for nome in ESTADO:
        b = baixar_obj("estado/" + nome)
        if b is None:
            faltando.append(nome)
            continue
        with open(os.path.join(d_estado, nome), "wb") as f:
            f.write(b)
        print("estado baixado: %s (%d bytes)" % (nome, len(b)))
    if faltando and not a.permitir_sem_estado:
        # Rodar sem o estado apaga a memória do painel (histórico e relógio da
        # fila). Isso só pode acontecer de propósito, nunca por acidente.
        sys.exit("ERRO: estado ausente no bucket (%s). Semeie com `semear` ou rode "
                 "com --permitir-sem-estado se for mesmo o ponto de partida."
                 % ", ".join(faltando))
    b = baixar_obj("publicado/dados.js")
    if b is not None:
        # atualizar.py compara o tamanho com o publicado (proteção contra planilha truncada).
        with open(os.path.join(d_web, "dados.js"), "wb") as f:
            f.write(b)
        print("dados.js publicado baixado para comparação (%d bytes)" % len(b))


def validar_dados_js(b):
    raw = b.decode("utf-8")
    pref = "window.DEA_DATA="
    fim = raw.rstrip().rfind(";")
    if not raw.startswith(pref) or fim <= len(pref):
        sys.exit("ERRO: dados.js em formato inesperado; nada enviado.")
    D = json.loads(raw[len(pref):fim])
    if D.get("agregados", {}).get("total_processos", 0) < 1:
        sys.exit("ERRO: dados.js sem processos; nada enviado.")


def enviar_tudo(dados, estado):
    validar_dados_js(dados)
    # Ordem igual à do atualizar.py: publica primeiro, promove o estado depois.
    enviar_obj("publicado/dados.js", dados, "application/javascript")
    hoje = datetime.date.today().isoformat()
    for nome, b in estado.items():
        enviar_obj("estado/" + nome, b, "application/json")
        enviar_obj("backup/%s/%s" % (hoje, nome), b, "application/json")


def cmd_enviar(a):
    d_estado, d_web = dirs()
    with open(os.path.join(d_web, "dados.js"), "rb") as f:
        dados = f.read()
    estado = {}
    for nome in ESTADO:
        with open(os.path.join(d_estado, nome), "rb") as f:
            estado[nome] = f.read()
    enviar_tudo(dados, estado)


def cmd_semear(a):
    for nome in ESTADO:
        if baixar_obj("estado/" + nome) is not None and not a.sobrescrever:
            sys.exit("ERRO: estado/%s já existe no bucket. Use --sobrescrever só se "
                     "tiver certeza (é a memória do painel)." % nome)
    with open(a.dados, "rb") as f:
        dados = f.read()
    estado = {}
    for nome in ESTADO:
        with open(os.path.join(a.estado, nome), "rb") as f:
            estado[nome] = f.read()
    enviar_tudo(dados, estado)


def cmd_criar_bucket(a):
    corpo = json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode()
    st, r = req("POST", "/storage/v1/bucket", corpo, "application/json")
    if st in (200, 201):
        print("bucket '%s' criado (privado)." % BUCKET)
    elif b"already exists" in r.lower() or st == 409:
        print("bucket '%s' já existe." % BUCKET)
    else:
        sys.exit("ERRO ao criar bucket: HTTP %s %s" % (st, r[:200]))
    st, r = req("GET", "/storage/v1/bucket/" + BUCKET)
    if st != 200 or json.loads(r).get("public") is not False:
        sys.exit("ERRO: o bucket '%s' NÃO está privado. Corrija no painel do Supabase." % BUCKET)
    print("confirmado: bucket privado.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("baixar")
    b.add_argument("--permitir-sem-estado", action="store_true")
    sub.add_parser("enviar")
    s = sub.add_parser("semear")
    s.add_argument("--estado", required=True)
    s.add_argument("--dados", required=True)
    s.add_argument("--sobrescrever", action="store_true")
    sub.add_parser("criar-bucket")
    a = ap.parse_args()
    {"baixar": cmd_baixar, "enviar": cmd_enviar, "semear": cmd_semear,
     "criar-bucket": cmd_criar_bucket}[a.cmd](a)


if __name__ == "__main__":
    main()
