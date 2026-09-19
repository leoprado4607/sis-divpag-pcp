# Retrato de referência — 19/09/2026

Estes são os números que o pipeline produziu na última execução antes da migração,
a partir da planilha baixada em **19/09/2026**.

**Para que servem:** depois de rodar o pipeline no servidor pela primeira vez, os
números têm de bater com esta tabela. Se baterem, o port está fiel. Se não baterem,
alguma regra divergiu — e o `testes/comparar_saidas.py` diz exatamente qual.

> **Atenção à data.** A planilha é viva. Se você rodar o port dias depois, os
> números legitimamente mudam. Para um teste limpo, use a mesma planilha e force
> `--data-ref 2026-09-19`, ou aceite que a comparação vai acusar diferenças reais.

---

## Volume geral

| Indicador | Valor |
|---|---|
| Processos nas 8 abas DEA | **3.421** |
| Valor total | R$ 30.057.786,44 |
| Anos cobertos | 2019 a 2026 |
| Aguardando o CPEx (só nas abas DEA) | 227 |
| Divergências entre as abas | 149 |
| Só no Acompanhamento (outras OM / anos anteriores) | 2.047 |

**Por situação:** pago 2.169 · rejeitado 760 · excluído 346 · em andamento 146

**Por segmento:** Ativa 2.460 · Pensionistas 754 · Veteranos 207

---

## Análise principal — Prec-cp repetido, mesmo ano

| Indicador | Valor |
|---|---|
| Grupos analisados | 593 |
| **Em risco** | **82** |
| Resolvidos | 500 |
| Atenção | 11 |
| Protocolos em risco | 189 |
| Valor em risco | R$ 1.100.084,54 |
| Em risco pela regra do ano (bruto, antes de excluir os pagos em ano posterior) | 95 |

## Entre anos

| Indicador | Valor |
|---|---|
| Grupos | 180 |
| **Em risco** | **14** |
| Protocolos | 43 |
| Prec-cp distintos | 14 |
| Valor sem pagamento | R$ 59.613,63 |

## Pago em outro ano

| Indicador | Valor |
|---|---|
| Grupos | 16 |
| Ano posterior (saem do risco) | 13 — 32 protocolos |
| Ano anterior (continuam no risco) | 3 |

## Homologados para lançamento (fila do SIPPES)

| Indicador | Valor |
|---|---|
| **Prontos para lançar** | **15** |
| Valor | R$ 6.664,00 |
| Excluídos por já constarem "Pago" | 100 |

## Fila de homologação

| Indicador | Valor |
|---|---|
| Na fila | **38** |
| Valor | R$ 38.487,58 |
| Parados há 2+ dias | 0 — *primeira leitura, relógio começou em 19/09* |
| Novos | 0 — *idem* |
| Segmentos | Ativa 37 · Veteranos 1 |
| Dias desde a protocolização | mínimo 2 · mediana 123 · **máximo 586** |

---

## Impressões digitais

Conferem a composição dos conjuntos, não só as contagens — dois resultados podem
ter 82 grupos em risco e não serem os mesmos 82.

```
grupos (todos os ids, ordenados)        sha256[:16] = af1cf4d7618b8e95
grupos_entre_anos (todos os ids)        sha256[:16] = b3f7ad95b92d3f6c
homologados (protocolos, ordenados)     sha256[:16] = fba7196843b6fdd9
```

Como recalcular:

```python
import json, hashlib
raw = open('dados.js', encoding='utf-8').read()
D = json.loads(raw[len('window.DEA_DATA='):raw.rstrip().rfind(';')])
h = lambda xs: hashlib.sha256("|".join(sorted(xs)).encode()).hexdigest()[:16]
C = {c: i for i, c in enumerate(D['campos'])}
print(h(g['id'] for g in D['grupos']))
print(h(g['id'] for g in D['grupos_entre_anos']))
print(h(D['processos'][i][C['protocolo']] for i in D['homologados_idx']))
```

---

## Parâmetros vigentes

| Parâmetro | Valor | Onde |
|---|---|---|
| Tolerância de valor entre protocolos do mesmo grupo | R$ 50,00 | `TOLERANCIA_VALOR` |
| Dias na fila para virar alerta | 2 (corridos) | `DIAS_ALERTA_FILA` |
| Máximo de execuções no histórico | 400 | `MAX_ENTRADAS` |
| Execuções que guardam o detalhe das mudanças | 90 | `MAX_DETALHE` |
| Fuso horário | America/Sao_Paulo | `agora_local()` |
| Abas de processos lidas | DEA 2019 … DEA 2026 | `ABAS_DEA` |
| Aba de resultado | Acompanhamento | `ABA_ACOMP` |
| Aba da fila | Protocolos para homologação | `ABA_HOMOLOG` |

---

## Estado do histórico neste pacote

Quatro execuções registradas, já convertidas para horário de Brasília:

| Execução | Alterações |
|---|---|
| 19/09/2026 às 10:09 | 0 |
| 19/09/2026 às 09:18 | 80 |
| 17/09/2026 às 09:07 | 0 |
| 16/09/2026 às 16:46 | 11 |

O histórico **começou em 16/09/2026** e não há como reconstruir o que veio antes.
