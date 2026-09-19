#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste de aceitação do Painel DEA: compara dois `dados.js` e diz se são a MESMA
análise sobre os mesmos dados.

PARA QUE SERVE
--------------
1. Conferir o PORT: rode o pipeline no servidor sobre a mesma planilha e compare
   com o dados.js de referência que veio no pacote. Tem de bater em tudo.
2. Conferir um REBUILD futuro: se um dia alguém reescrever o painel de forma
   nativa no site, este script é o que separa "reescreveu" de "reescreveu certo".

O que ele compara, em ordem de gravidade:
  - agregados (os números que aparecem na tela)
  - conjunto de grupos em risco, por id  -> a análise principal
  - conjunto de grupos "entre anos"
  - fila de homologação
  - lista de homologados para lançamento
  - classificação processo a processo (situação efetiva)

O que ele IGNORA de propósito: `meta.gerado_em`, `meta.gerado_em_iso` e o
`historico`, que mudam a cada execução por definição.

USO
    python3 comparar_saidas.py referencia/dados.js novo/dados.js
    echo $?     # 0 = idêntico, 1 = divergiu
"""

import json
import sys

PREF = "window.DEA_DATA="

# mudam a cada rodada; comparar isso só geraria ruído
IGNORAR_META = {"gerado_em", "gerado_em_iso"}


def carregar(caminho):
    with open(caminho, encoding="utf-8") as f:
        raw = f.read()
    if not raw.startswith(PREF):
        sys.exit("ERRO: %s não começa com '%s'" % (caminho, PREF))
    return json.loads(raw[len(PREF):raw.rstrip().rfind(";")])


def cabecalho(t):
    print("\n" + t)
    print("-" * len(t))


def comparar_dict(a, b, nome, ignorar=()):
    chaves = sorted(set(a) | set(b))
    difs = []
    for k in chaves:
        if k in ignorar:
            continue
        va, vb = a.get(k, "<ausente>"), b.get(k, "<ausente>")
        if va != vb:
            difs.append((k, va, vb))
    cabecalho("%s — %d campo(s)" % (nome, len(chaves)))
    if not difs:
        print("  OK: idênticos")
    else:
        for k, va, vb in difs:
            print("  DIVERGE  %-28s referência=%-22s novo=%s" % (k, va, vb))
    return difs


def comparar_conjunto(a, b, nome, rotulo="item"):
    sa, sb = set(a), set(b)
    cabecalho("%s — %d na referência, %d no novo" % (nome, len(sa), len(sb)))
    so_a, so_b = sorted(sa - sb), sorted(sb - sa)
    if not so_a and not so_b:
        print("  OK: mesmos %ss" % rotulo)
        return []
    if so_a:
        print("  SÓ NA REFERÊNCIA (%d): %s" % (len(so_a), ", ".join(map(str, so_a[:25]))
                                               + (" ..." if len(so_a) > 25 else "")))
    if so_b:
        print("  SÓ NO NOVO (%d): %s" % (len(so_b), ", ".join(map(str, so_b[:25]))
                                         + (" ..." if len(so_b) > 25 else "")))
    return so_a + so_b


def indexar_processos(D):
    """protocolo -> (situação efetiva, classe, valor). É a classificação que importa."""
    C = {c: i for i, c in enumerate(D["campos"])}
    fora = {}
    for linha in D["processos"]:
        fora[linha[C["protocolo"]]] = (
            linha[C["sit_efetiva"]], linha[C["sit_efetiva_classe"]], linha[C["valor"]])
    return fora


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    ref, novo = carregar(sys.argv[1]), carregar(sys.argv[2])
    problemas = 0

    print("=" * 72)
    print("COMPARAÇÃO DE SAÍDAS DO PAINEL DEA")
    print("  referência: %s  (retrato de %s)" % (sys.argv[1], ref["meta"]["data_ref"]))
    print("  novo      : %s  (retrato de %s)" % (sys.argv[2], novo["meta"]["data_ref"]))
    print("=" * 72)

    if ref["meta"]["data_ref"] != novo["meta"]["data_ref"]:
        print("\nATENÇÃO: os retratos são de datas diferentes. Divergências abaixo\n"
              "podem ser só a planilha ter mudado entre as duas execuções. Para um\n"
              "teste limpo, rode os dois sobre a MESMA planilha e use --data-ref igual.")

    problemas += len(comparar_dict(ref["meta"], novo["meta"], "META", IGNORAR_META))
    problemas += len(comparar_dict(ref["agregados"], novo["agregados"], "AGREGADOS"))

    # --- a análise principal: quais grupos estão em risco
    def risco(D, chave):
        return [g["id"] for g in D[chave] if g.get("status") == "risco"]
    problemas += len(comparar_conjunto(risco(ref, "grupos"), risco(novo, "grupos"),
                                       "GRUPOS EM RISCO (Prec-cp/ano)", "grupo"))
    problemas += len(comparar_conjunto(risco(ref, "grupos_entre_anos"),
                                       risco(novo, "grupos_entre_anos"),
                                       "GRUPOS EM RISCO (entre anos)", "grupo"))
    problemas += len(comparar_conjunto([g["id"] for g in ref["grupos"]],
                                       [g["id"] for g in novo["grupos"]],
                                       "TODOS OS GRUPOS (Prec-cp/ano)", "grupo"))

    # --- homologados para lançamento (a fila de trabalho da OM)
    def homologados(D):
        C = {c: i for i, c in enumerate(D["campos"])}
        return [D["processos"][i][C["protocolo"]] for i in D["homologados_idx"]]
    problemas += len(comparar_conjunto(homologados(ref), homologados(novo),
                                       "HOMOLOGADOS PARA LANÇAMENTO", "protocolo"))

    # --- fila de homologação
    fr, fn = ref.get("homolog", {}), novo.get("homolog", {})
    if fr.get("disponivel") or fn.get("disponivel"):
        problemas += len(comparar_conjunto([i["protocolo"] for i in fr.get("itens", [])],
                                           [i["protocolo"] for i in fn.get("itens", [])],
                                           "FILA DE HOMOLOGAÇÃO", "protocolo"))

    # --- classificação processo a processo
    ir, inv = indexar_processos(ref), indexar_processos(novo)
    cabecalho("CLASSIFICAÇÃO PROCESSO A PROCESSO — %d x %d" % (len(ir), len(inv)))
    comuns = set(ir) & set(inv)
    difs = [(p, ir[p], inv[p]) for p in sorted(comuns) if ir[p] != inv[p]]
    faltando, sobrando = sorted(set(ir) - set(inv)), sorted(set(inv) - set(ir))
    if not difs and not faltando and not sobrando:
        print("  OK: todos os %d processos com a mesma situação, classe e valor" % len(comuns))
    else:
        for p, a, b in difs[:30]:
            print("  DIVERGE  protocolo %-9s referência=%-45s novo=%s" % (p, a[0][:45], b[0][:45]))
        if len(difs) > 30:
            print("  ... e mais %d" % (len(difs) - 30))
        if faltando:
            print("  ausentes no novo (%d): %s" % (len(faltando), ", ".join(faltando[:15])))
        if sobrando:
            print("  a mais no novo (%d): %s" % (len(sobrando), ", ".join(sobrando[:15])))
        problemas += len(difs) + len(faltando) + len(sobrando)

    print("\n" + "=" * 72)
    if problemas == 0:
        print("RESULTADO: IDÊNTICOS. O novo pipeline reproduz a análise de referência.")
    else:
        print("RESULTADO: %d DIVERGÊNCIA(S). Veja acima qual regra mudou." % problemas)
        print("Comece pelos AGREGADOS: quase sempre uma diferença de classificação\n"
              "(MAPA_SITUACAO) explica todas as outras de uma vez.")
    print("=" * 72)
    sys.exit(0 if problemas == 0 else 1)


if __name__ == "__main__":
    main()
