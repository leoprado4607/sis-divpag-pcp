#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baixa a planilha DEA do Google Drive usando uma CONTA DE SERVIÇO.

É a ÚNICA peça realmente nova da migração. No ambiente anterior quem baixava a
planilha era o conector do Google Drive da Claude, com o login OAuth do usuário.
No servidor esse conector não existe, então a credencial passa a ser uma conta
de serviço — que não expira, não abre navegador e funciona em cron.

PRÉ-REQUISITOS (feitos uma vez, no console do Google Cloud)
-----------------------------------------------------------
1. Criar um projeto (ou usar um existente) em https://console.cloud.google.com
2. Ativar a "Google Drive API" nesse projeto.
3. Criar uma conta de serviço e gerar uma chave JSON.
4. COMPARTILHAR A PLANILHA com o e-mail da conta de serviço
   (algo como  dea-painel@<projeto>.iam.gserviceaccount.com), papel LEITOR.
   Sem este passo a conta existe mas não enxerga o arquivo — é o esquecimento
   mais comum, e o erro que aparece é 404, não 403.
5. Guardar o JSON no servidor com permissão restrita:
       chmod 600 credencial.json
       chown <usuario-do-servico> credencial.json
   NUNCA versionar esse arquivo no git.

DEPENDÊNCIAS
------------
    pip install google-api-python-client google-auth

USO
---
    # confere se a credencial enxerga a planilha, sem baixar nada
    python3 drive_download.py --verificar

    # baixa
    python3 drive_download.py --saida /caminho/DEA.xlsx
"""

import argparse
import io
import os
import sys

FILE_ID_PADRAO = "1mL_wHtnTRbA4Ng6M0exe-wNULVPfNfPLcJJCjxF1tlk"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MIME_GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet"
ESCOPOS = ["https://www.googleapis.com/auth/drive.readonly"]

# Export do Drive tem teto de 10 MB. Hoje a planilha sai com ~0,6 MB, mas se um
# dia estourar o erro vem como 403 "exportSizeLimitExceeded" — e aí o caminho é
# ler aba por aba pela API do Sheets em vez de exportar o arquivo inteiro.
TETO_EXPORT_MB = 10


def _servico(caminho_credencial):
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        sys.exit("ERRO: faltam dependências. Rode:\n"
                 "    pip install google-api-python-client google-auth")
    if not os.path.exists(caminho_credencial):
        sys.exit("ERRO: credencial não encontrada em %s\n"
                 "Defina DEA_GOOGLE_CREDENCIAL ou use --credencial."
                 % caminho_credencial)
    cred = service_account.Credentials.from_service_account_file(
        caminho_credencial, scopes=ESCOPOS)
    return build("drive", "v3", credentials=cred, cache_discovery=False), cred


def metadados(servico, file_id):
    return servico.files().get(
        fileId=file_id,
        fields="id,name,mimeType,modifiedTime,owners(emailAddress)",
        supportsAllDrives=True,
    ).execute()


def baixar(file_id, destino, caminho_credencial):
    """
    Devolve os metadados do arquivo baixado.

    Trata os dois casos possíveis:
      - planilha nativa do Google  -> export_media para .xlsx
      - arquivo .xlsx já hospedado -> get_media (download direto)
    Hoje é o primeiro caso, mas se alguém substituir o arquivo por um upload
    o script continua funcionando em vez de falhar com um erro obscuro.
    """
    from googleapiclient.http import MediaIoBaseDownload
    from googleapiclient.errors import HttpError

    servico, _ = _servico(caminho_credencial)
    try:
        meta = metadados(servico, file_id)
    except HttpError as e:
        if e.resp.status == 404:
            sys.exit("ERRO 404: a conta de serviço não enxerga o arquivo %s.\n"
                     "Quase sempre é a planilha que não foi COMPARTILHADA com o\n"
                     "e-mail da conta de serviço. Confira o passo 4 do cabeçalho."
                     % file_id)
        raise

    if meta["mimeType"] == MIME_GOOGLE_SHEET:
        req = servico.files().export_media(fileId=file_id, mimeType=MIME_XLSX)
    else:
        req = servico.files().get_media(fileId=file_id, supportsAllDrives=True)

    buf = io.BytesIO()
    baixador = MediaIoBaseDownload(buf, req, chunksize=1024 * 1024)
    concluido = False
    while not concluido:
        _, concluido = baixador.next_chunk()

    dados = buf.getvalue()
    if not dados:
        sys.exit("ERRO: download vazio.")
    # .xlsx é um zip: tem de começar com "PK"
    if dados[:2] != b"PK":
        sys.exit("ERRO: o conteúdo baixado não parece um .xlsx (não começa com 'PK').")

    os.makedirs(os.path.dirname(os.path.abspath(destino)) or ".", exist_ok=True)
    # grava em temporário e move: evita deixar um .xlsx pela metade se cair no meio
    tmp = destino + ".parcial"
    with open(tmp, "wb") as f:
        f.write(dados)
    os.replace(tmp, destino)
    meta["_bytes"] = len(dados)
    return meta


def main():
    ap = argparse.ArgumentParser(description="Baixa a planilha DEA via conta de serviço.")
    ap.add_argument("--file-id", default=os.environ.get("DEA_FILE_ID", FILE_ID_PADRAO))
    ap.add_argument("--credencial",
                    default=os.environ.get("DEA_GOOGLE_CREDENCIAL", "credencial.json"))
    ap.add_argument("--saida", default="DEA.xlsx")
    ap.add_argument("--verificar", action="store_true",
                    help="só confere o acesso e mostra os metadados, sem baixar")
    a = ap.parse_args()

    if a.verificar:
        servico, cred = _servico(a.credencial)
        print("conta de serviço ...... %s" % cred.service_account_email)
        try:
            m = metadados(servico, a.file_id)
        except Exception as e:
            sys.exit("SEM ACESSO: %s\n\nCompartilhe a planilha com o e-mail acima "
                     "(papel Leitor)." % e)
        print("arquivo ............... %s" % m.get("name"))
        print("mimeType .............. %s" % m.get("mimeType"))
        print("modificado em ......... %s" % m.get("modifiedTime"))
        print("\nACESSO OK.")
        return

    m = baixar(a.file_id, a.saida, a.credencial)
    mb = m["_bytes"] / (1024 * 1024)
    print("baixado: %s (%s) -> %s  [%.2f MB]" % (m.get("name"), m.get("mimeType"),
                                                 a.saida, mb))
    if mb > TETO_EXPORT_MB * 0.8:
        print("AVISO: o arquivo está perto do teto de export do Drive (%d MB)."
              % TETO_EXPORT_MB, file=sys.stderr)


if __name__ == "__main__":
    main()
