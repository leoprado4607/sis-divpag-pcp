# Painel DEA — regras de negócio e decisões

Base Administrativa da Guarnição de Natal (B Adm Gu Natal).
Notas para quem (ou o que) retomar este trabalho depois.

## Fonte

Planilha "DEA" no Google Drive, fileId `1mL_wHtnTRbA4Ng6M0exe-wNULVPfNfPLcJJCjxF1tlk`.
Nove abas: `DEA 2019` a `DEA 2026` (processos protocolados) e `Acompanhamento`
(resultado do processo). A chave de ligação é o **Protocolo**.

## Como um processo entra na aba Acompanhamento

**Um processo só ganha linha na aba `Acompanhamento` depois de avaliado,
aprovado/rejeitado e/ou homologado pelo CPEx.** Enquanto não passa por essa
etapa, ele consta **apenas** nas abas DEA.

Consequência para o painel: os processos sem linha no Acompanhamento **não são
lacuna de registro** — são a fase em que o processo está. Para eles, a situação
vigente é a da própria aba DEA. O painel deve chamá-los de *"aguardando o
CPEx"*, nunca de *"sem linha"* ou *"ausente"*.

Confirmação nos dados (retrato de 14/09/2026): dos 231 nessa condição,
189 estão como "Processo Excluído pelo Operador" (excluídos antes de qualquer
análise), 41 "Protocolado e Aguardando Análise" e 1 aguardando documentação —
coerente com a regra acima.

## Situação vigente

`sit_efetiva` = situação do Acompanhamento quando existe; senão, a da aba DEA.
O Acompanhamento está à frente do fluxo: no retrato de 14/09/2026 havia 135
divergências, das quais 100 eram processos que a aba DEA 2026 ainda mostrava
como "Pagamento autorizado (CPEx)" e o Acompanhamento já dava como "Pago".

As duas abas grafam a mesma situação de formas diferentes ("Pago" × "Pago.",
"à OM/OP." × "à OM / OP."). O `build_data.py` normaliza via `MAPA_SITUACAO`,
com chave sem acento e sem pontuação. **Ao surgir situação nova na planilha,
acrescente a chave nesse mapa** — o script avisa na saída quando encontra uma
situação não prevista e cai numa heurística de reserva.

### "Processado o Pagamento" NÃO é pagamento concluído (corrigido em 16/09/2026)

`PGTO_PROCESSADO` tem classe **`andamento`**, não `pago`. Significa que o CPEx
processou e a OM **ainda precisa lançar** no SIPPES/SIAPPES; o crédito só está
na conta quando a situação é **"Pago"**. Só `PAGO` (e `PAGO_OUTRO`, da
heurística) fecham o processo.

Antes de reclassificar, foi medido o alcance — e ele é contido: no retrato de
16/09/2026 o texto aparece **15 vezes em toda a aba Acompanhamento**, todas com
situação DEA "Homologado pelo OD do CPEx", e **nenhuma delas participa de
qualquer grupo** (nem em "Prec-cp repetido", nem em "Entre anos", nem sustenta o
pagamento de algum grupo em "Pago em outro ano"). Por isso a correção não mexeu
no indicador de risco, que seguiu em 78. **Se um dia esse texto passar a aparecer
dentro de grupos, refaça essa medição** — ali ele decide se um grupo é
"resolvido" ou "em risco".

## A análise principal: DEA pendente (antes "Prec-cp repetido")

**Regra vigente desde 21/09/2026, por pedido do usuário:** mesmo **nome** +
mesmo **Prec-cp** + mesmo **Nr BI** + mesmo ano, **qualquer que seja o
valor** (a referência de R$ 50,00 deixou de agrupar).

**Protocolo único também entra (pedido do usuário, 21/09/2026):** até então só
chaves com 2 ou mais protocolos formavam grupo; agora o nome/Prec-cp com **um
único protocolo** vira grupo de 1 (`agrupar_repetidos` não descarta mais
`len < 2`). Vale para todas as abas de grupos. Na prática afeta só as abas de
ano único ("DEA encerrado sem pagamento" e "DEA pendente de análise CPEx"):
um protocolo só tem um ano, então nunca cai em "Entre anos" nem em "Pago em
outro ano". Protocolo único pago fica de fora, como qualquer grupo pago. As
contagens `grupos_*` de `agregados` (e o `risco` do Histórico) passam a
incluir esses grupos — o salto no número na primeira rodada é esperado.

- **Nr BI** comparado sem espaços, em maiúsculas e **sem zero à esquerda** em
  cada número (`norm_bi`): "045/2026" = "45/2026", "BI 007" = "BI7".
- **Nome** comparado sem acento, caixa e pontuação (`_slug`).
- Protocolo **sem Prec-cp ou sem nome não entra** em grupo.
- Protocolo **sem Nr BI** agrupa com os do mesmo nome + Prec-cp que **também não
  têm BI** (não se mistura com os que têm BI, pois não há como saber a qual
  deles pertenceria). O painel mostra o Nr BI desses como **"???"**
  (`BI_AUSENTE`), no cabeçalho do grupo e nas tabelas.
- Chave cujos protocolos caem em **anos diferentes** vai **inteira** para a aba
  "Entre anos" e **não** aparece nesta tela (`agrupar_repetidos`).

**A aba mostra só grupos SEM pagamento** (pedido do usuário, 21/09/2026): os
"resolvido" (algum protocolo pago) ficam de fora — só interessam os ainda não
pagos. O filtro está no painel (`naoPago()` em `recortar()`), vale também para
"Entre anos" e para os relatórios PDF; o pipeline continua gerando os grupos
resolvidos no `dados.js` (e contando-os em `agregados`).

Na tela, a aba perdeu os três filtros de situação do grupo (risco, atenção,
resolvido) e ganhou o filtro por **protocolo**. Os
selos de contagem no cabeçalho do grupo contam **só a "Situação — DEA"** de
todos os protocolos, e não há mais o selo "aguardando CPEx" (pedido do usuário,
21/09/2026 — antes contavam só a situação do Acompanhamento). Vale para todas
as abas de grupos, inclusive "Pago em outro ano", e para os relatórios PDF
(`contagensDea()` no painel). A
classificação risco/atenção/resolvido (veredito e contador da aba) não mudou.

**Divisão em duas abas (pedido do usuário, 21/09/2026).** Os grupos sem
pagamento de ano único passaram a ser exibidos em duas abas, conforme haja ou
não protocolo que ainda possa ser aprovado:

- **DEA encerrado sem pagamento** — nenhum protocolo do grupo tem situação
  efetiva de classe `andamento`: todos são `rejeitado` (Analisado e Rejeitado /
  Restituído, Rejeitado no Processamento) ou `excluido` (Excluído pelo
  Operador). Vereditos: risco (há rejeitado) e atenção (só excluídos).
- **DEA pendente de análise CPEx** — ao menos um protocolo do grupo tem
  situação efetiva de classe `andamento` (Protocolado e aguardando análise ou
  documentação, Aguardando envio pela DAP / Homologação, Homologado, Aprovado
  aguardando pagamento, Pagamento autorizado, Processado o Pagamento, "Sem
  informação" e textos novos não mapeados que caem na reserva `andamento`).
  Veredito único "Em análise".

**Protocolo em "Homologados para lançamento" sai do grupo (pedido do usuário,
14/10/2026).** O protocolo que está na lista `HOMOL` da aba "Homologados para
lançamento" (inclusive os de mês da folha já registrado) já foi analisado e segue
para pagamento: sai do grupo **sem pagamento** — só ele; os demais protocolos
continuam, para o administrador tratar à mão. O grupo é reclassificado com o
que sobrou (mesma regra do `build_data.py`: rejeitado ou em curso → risco; só
excluídos → atenção) e, se nenhum continuar em curso, passa de "pendente de
análise CPEx" para "encerrado sem pagamento". Grupo que fica vazio não aparece.
Vale para as abas de ano único (inclusive os avulsos de "Manter pendente") e
para "Entre anos". Grupo pago não muda. No código: `tirarHomologados()` no
`painel.html`, logo depois da separação dos avulsos. Homologado de ano anterior
ao corrente não entra em `HOMOL` e, portanto, continua no grupo. "Rejeitado em
grupo pago" não muda.

**Em curso de valor diferente em grupo pago (pedido do usuário, 15/10/2026).**
Caso que originou a regra: 536757 (R$ 1.553,19, "Protocolado e Aguardando
Análise") refazendo o rejeitado 531490 (mesmo valor), no mesmo nome, Prec-cp e
Nr BI do 531488 (R$ 517,73, **pago**). O grupo dos três era "resolvido" e sumia
de todas as abas; a aba "Rejeitado em grupo pago" só pega rejeitados, então o
536757 — ainda não pago — não aparecia em lugar nenhum.

Regra: num grupo com protocolo pago (de ano único ou de "Pago em outro ano"), o
protocolo de classe **`andamento`** cujo valor é **diferente de todos os pagos**
do grupo (1 centavo ou mais) vai para **"DEA pendente de análise CPEx"**, num
grupo próprio (um por grupo de origem e ano), com o selo **"grupo com pago:
&lt;protocolos&gt;"** (tela e PDF) e explicação própria. O grupo pago não muda.
Ficam de fora os mantidos pendentes (já viram avulsos) e os homologados
(`tirarHomologados()`); "Enviar para resolvidos" funciona como em qualquer grupo.
O aviso "pago em outro BI" desse grupo ignora os pagos do grupo de origem (já
citados no selo). Calculado no painel (`GRUPOS_EMCURSO_PAGO`), sem mudança no
`build_data.py`; os contadores de `agregados` e do Histórico não mudam.
Retrato de 15/10/2026: 4 protocolos (535126, 536757, 524524, 536242), todos
"Protocolado e Aguardando Análise", todos da Ativa.

O critério usa a classe já produzida pelo `build_data.py` (`MAPA_SITUACAO`),
sem mudança no pipeline: o filtro está no painel (`emCurso()` em `recortar()`).
A aba "Entre anos" recebeu a mesma divisão (pedido do usuário, 21/09/2026):
**Entre anos — encerrado sem pagamento** (`V.EA`, vereditos risco/atenção) e
**Entre anos — pendente de análise CPEx** (`V.EC`, veredito "Em análise"),
pelo mesmo `emCurso()`. Cada uma tem filtros e relatório PDF próprios.

Não há mais referência de valor em nenhuma aba de grupos: `TOLERANCIA_VALOR` (R$ 50)
foi removida em 21/09/2026 (ver "Pago em outro ano").

A primeira execução sob a regra nova **não foi medida contra os dados reais**
(o ambiente onde foi feita não tinha a planilha). Na próxima atualização,
compare o total de grupos, de risco e de "Entre anos" com a rodada anterior no
Histórico e confira alguns grupos à mão.

O texto a seguir descreve a regra anterior, mantido como histórico.

### Regra anterior (até 20/09/2026)

Mesmo Prec-cp + mesmo ano + 2 ou mais protocolos + valores a no máximo
**R$ 50,00** entre si. Classificação inicial (campo `status_ano`):

- **risco** — nenhum do grupo está pago e há processo vivo (rejeitado ou em
  andamento). Foi rejeitado, corrigido, relançado e ninguém pagou.
- **atenção** — nenhum pago e todos excluídos pelo operador.
- **resolvido** — algum do grupo foi pago; os demais são as tentativas
  corrigidas.

O agrupamento por valor usa varredura ordenada com janela fixa a partir do menor
valor do grupo, de modo que todo par dentro de um grupo respeite os R$ 50.
Testado contra o método encadeado (single linkage): 589 grupos pelos dois, e
nenhum grupo de risco escapa — os valores dentro de um Prec-cp/ano são colados
demais (amplitude de centavos) para a diferença importar.

## Regra do indicador "Grupos em risco"

> **Superada em 21/09/2026:** com o agrupamento por nome + Prec-cp + Nr BI não
> há mais reclassificação por pagamento em outro ano (ver "Pago em outro ano");
> `grupos_risco` passou a ser igual a `grupos_risco_regra_ano`. O texto abaixo é
> a regra anterior.

**O indicador conta apenas os grupos que ainda não foram pagos em ano algum.**
Depois da classificação acima, `marcar_pagamento_outro_ano()` reclassifica para
`resolvido` (com `resolvido_por = "ano_posterior"`) todo grupo sem pagamento no
próprio ano cujo Prec-cp registre pagamento de valor equivalente em **ano
posterior** — o crédito saiu, logo não é pendência.

Pagamento em ano **anterior** não reclassifica nada: ver a seção seguinte.

`status_ano` preserva a classificação pela regra do mesmo ano, e
`agregados["grupos_risco_regra_ano"]` guarda o total bruto, usado só como linha
de contexto. O número exibido no painel é `agregados["grupos_risco"]`, já
líquido. Retrato de 16/09/2026: **78 grupos em risco** (seriam 91 pela regra do
ano), 181 protocolos, R$ 1.091.598,72.

## Aba "Entre anos"

O ciclo rejeição → correção → relançamento não respeita o ano civil: rejeição em
outubro volta corrigida em janeiro. A regra "mesmo ano" deixava esses casos
invisíveis. A aba "Entre anos" aplica o mesmo critério da tela principal **sem a
trava do ano** e mostra só os grupos que atravessam a virada (os de ano único ficam na
tela principal). Desde 21/09/2026 o critério é nome + Prec-cp + Nr BI (ver acima);
antes era o de valor (R$ 50).

Também desde 21/09/2026, por pedido do usuário:

- **Grupo entre anos com algum protocolo pago sai desta aba e vai para "Pago em
  outro ano"** (`separar_pagos_entre_anos`, campo `origem = "entre_anos"`). Aqui
  ficam só os sem pagamento (risco ou atenção). O `pago_fora` desses grupos é
  montado com os protocolos pagos do próprio grupo; o sentido compara o ano do
  pagamento com o das tentativas não pagas: **posterior** (pago depois de todas),
  **anterior** (antes de todas) ou **misto** (tentativas antes e depois).
- Saíram os filtros de situação do grupo; entraram os filtros de **ano** (casa
  com qualquer ano que o grupo atravessa) e de **protocolo**.
- Os selos de contagem contam só a "Situação — DEA" (igual a "DEA pendente").

Retrato de 16/09/2026, pela regra anterior (valor, R$ 50): 7 grupos em risco,
23 protocolos, 7 Prec-cp, R$ 56.642,52 sem pagamento.

## Aba "Pago em outro ano"

**Regra vigente desde 21/09/2026, por pedido do usuário:** a aba segue o
critério de "DEA pendente" (mesmo nome + Prec-cp + Nr BI, qualquer valor) e é
formada **só** pelos grupos que atravessam a virada do ano e têm algum protocolo
pago (`separar_pagos_entre_anos`). "Entre anos" fica só com os não pagos.

Consequência que precisa ficar clara: **acabou a busca por pagamento de valor
parecido (R$ 50) do mesmo Prec-cp em outro ano.** Pela chave nova, um pagamento
em outro ano com o mesmo nome, Prec-cp e Nr BI já faz o grupo atravessar a
virada; pagamento com **outro** Nr BI é outro processo e não conta. Por isso:

- `TOLERANCIA_VALOR` foi removida do `build_data.py` (e o `verificar_pacote.py`
  passou a conferir a ausência dela);
- `marcar_pagamento_outro_ano()` não reclassifica mais nada — deixou de existir
  o "resolvido por pagamento em ano posterior" em "DEA pendente", e
  `grupos_risco` = `grupos_risco_regra_ano`;
- o sentido (`posterior` / `anterior` / `misto`) compara o ano do pagamento com o
  das tentativas não pagas do próprio grupo.

Na tela saíram os filtros "Ano posterior" / "Ano anterior"; entraram **ano**
(qualquer ano que o grupo atravessa) e **protocolo**. O contador da aba passou a
mostrar o total de grupos. Os selos contam só a "Situação — DEA".

O texto a seguir descreve a regra anterior, mantido como histórico.

### Regra anterior (até 20/09/2026)

Grupos que **não** tiveram pagamento no próprio ano, mas cujo Prec-cp registra
pagamento de valor equivalente (mesma tolerância de R$ 50) em **ano diferente**.
A lista é montada a partir de `sem_pagto_no_ano`, não do status final — por isso
os reclassificados continuam aparecendo aqui.

A direção do pagamento muda a conclusão e não pode ser colapsada:

- **posterior** — rejeitado num ano, pago depois. O crédito saiu; sai do risco
  (é a regra da seção anterior). Retrato: **13 grupos, 32 protocolos**.
- **anterior** — o pagamento é anterior às tentativas rejeitadas. Isso **não**
  comprova quitação: em geral se refere a outra dívida, de outro período, com
  valor por acaso parecido (ex.: Prec-cp 411648310, pago R$ 43,28 em out/2025 e
  quatro novas tentativas de R$ 43,28 rejeitadas em 2026). **Continua no risco.**
  Retrato: **3 grupos** (411648310/2026, 411647593/2026, 357702665/2023).

## Aviso "pago em outro BI" (21/09/2026)

Efeito colateral da chave nome + Prec-cp + Nr BI: quando a correção de um
protocolo rejeitado sai com **outro Nr BI**, os dois caem em grupos diferentes, e
o rejeitado aparece sozinho em "DEA encerrado sem pagamento" mesmo com a pessoa
já paga. Caso que originou a regra: um protocolo rejeitado com outro, do mesmo
nome e Prec-cp, pago no mesmo ano.

Decisão do usuário: **avisar, não reclassificar** — o pagamento em outro BI pode
ser de outra dívida. Em todas as abas de grupos sem pagamento (as duas de ano único
e as duas de "Entre anos"), o grupo ganha o selo **"pago em outro BI: <protocolos>"**
e, aberto, um quadro com os protocolos pagos do **mesmo nome e Prec-cp**, fora do
grupo, no(s) **ano(s) do grupo**. O relatório PDF traz o mesmo selo.

Calculado **no painel** (`marcarPagosPessoa()`, a partir de `processos`), sem
mudança no `build_data.py`. O nome é comparado como no `_slug` do pipeline
(`chavePessoa()`). A classificação e os contadores não mudam.

**Limite de R$ 2.000,00 (pedido do usuário, 29/09/2026):** o pago de outro BI só
entra no aviso quando o valor dele difere em **até R$ 2.000,00** de algum protocolo
do grupo (`LIMITE_OUTRO_BI`). Acima disso é outra dívida e o aviso não aparece.
Retrato de 29/09/2026: 17 grupos sem pagamento tinham o aviso; com o limite, 13.

## Rejeitado em grupo pago (29/09/2026)

Caso que originou a regra: protocolo 534106 (R$ 433,17, rejeitado — "refazer o
protocolo, código de saque AEL e não AEA") no mesmo nome, Prec-cp e Nr BI do 534041
(R$ 1.299,50, aprovado aguardando pagamento). Pela chave nome + Prec-cp + Nr BI os
dois são um grupo só; quando o 534041 for pago, o grupo vira "resolvido" e **some de
todas as abas** — escondendo um rejeitado que parece ser outra dívida.

Regra (pedido do usuário): num grupo com protocolo pago (de ano único ou de "Pago em
outro ano"), o protocolo **rejeitado** cujo valor é **diferente de todos os pagos do
grupo** (diferença de 1 centavo ou mais) vai para a aba **"Rejeitado em grupo pago"**,
para conferência. Rejeitado com o **mesmo valor** do pago continua sendo a tentativa
corrigida e não aparece. Ficam de fora os protocolos já **resolvidos manualmente** e os
**mantidos pendentes**. Calculado no painel (`aConferir()`), sem mudança no
`build_data.py`; os contadores de `agregados` e do Histórico não mudam.

Retrato de 29/09/2026: 220 grupos (182 da Ativa, 101 deles vindos de "Pago em outro
ano"), 321 rejeitados a conferir; nenhum já estava nos resolvidos manuais. O 534106
ainda não aparece ali — o 534041 não foi pago; está em "DEA pendente de análise CPEx".

Na aba, cada rejeitado destacado tem, para o administrador, **"Enviar para
resolvidos"** (é o mesmo crédito do pago; grava só aquele protocolo) e **"Manter
pendente"** (ver abaixo).

### Também em grupo sem pagamento com protocolo em curso (29/09/2026)

Pedido do usuário, para o 534106 já poder sair do grupo do 534041 antes do
pagamento. Num grupo **sem pagamento** e com protocolo em **andamento** (abas
"DEA pendente de análise CPEx" e "Entre anos — pendente de análise CPEx"), o
rejeitado cujo valor é diferente de **todos os protocolos em andamento** do grupo
fica destacado como **"a conferir"** (selo no cabeçalho e linha realçada), com os
botões por protocolo "Enviar para resolvidos" e "Manter pendente". A referência
passa a ser o pago quando o grupo tem pagamento (aba "Rejeitado em grupo pago").
Retrato de 29/09/2026: 39 grupos (38 da Ativa), 53 rejeitados a conferir.

- **Manter pendente** num protocolo só: ele vira grupo avulso em "DEA encerrado sem
  pagamento" e **sai do grupo original**, que segue com os demais (ex.: o 534041
  fica sozinho em "pendente de análise CPEx"). Se o grupo inteiro for mantido (botão
  do grupo), ele continua onde está, com o selo.
- **Enviar para resolvidos** num protocolo só: tira o destaque; o grupo continua
  visível (só some quando todos os protocolos estão resolvidos).

## Mantidos pendentes (29/09/2026)

O contrário do "resolvido manual": o administrador confirma que o protocolo é
**pendência própria, sem relação** com outro protocolo pago — do mesmo Nr BI (aba
"Rejeitado em grupo pago") ou de outro Nr BI (o aviso "pago em outro BI"). O botão
**"Manter pendente"** aparece por protocolo em "Rejeitado em grupo pago" e por grupo
nas quatro abas de grupos sem pagamento; pede **motivo**, como o "Enviar para
resolvidos" (sem senha desde 07/10/2026 — ver "Ações do administrador sem senha").

- Lista **separada**: `manual/pendentes.json` no bucket privado (`{pendentes, log}`),
  anexada ao `dados.js` como `window.DEA_PENDENTES`. **Não toca** no
  `manual/resolvidos.json`, que mantém o formato e os registros de antes. Em dev com
  `DEA_DADOS_LOCAL`, fica em `pendentes-manuais.json`.
- O servidor recusa marcar como mantido um protocolo **resolvido** ("desfaça lá
  antes") e recusa manter duas vezes o mesmo protocolo.
- **O resolvido prevalece** (09/10/2026, pedido do usuário): o protocolo mantido
  **pode** ser enviado para resolvidos (antes o servidor recusava). A marcação de
  mantido fica guardada em `pendentes.json`, mas o grupo sai das abas de pendência
  como qualquer resolvido; na aba "Mantidos pendentes" a linha ganha o selo
  **"enviado para resolvidos"**. Se o resolvido for desfeito, o grupo volta com o
  selo "pendente confirmado".
- Efeito no painel: o grupo cujos protocolos estão **todos** mantidos ganha o selo
  **"pendente confirmado"**, perde o aviso "pago em outro BI" e mostra só o botão
  **"Enviar para resolvidos"** (o "Manter pendente" desfaz-se na aba "Mantidos
  pendentes"; até 09/10/2026 não mostrava nenhum botão). O rejeitado **vindo de grupo pago** vira
  grupo avulso de 1 (`GRUPOS_AVULSOS`) e entra em "DEA encerrado sem pagamento" (ou em
  "pendente de análise CPEx", se voltar a andar); se for **pago** depois, sai sozinho.
- A aba **"Mantidos pendentes"** lista as marcações com a situação atual de cada
  protocolo e, para o administrador, **"Desfazer"**.
- O contador de "DEA encerrado sem pagamento" passa a incluir os avulsos.
- **Separar um protocolo do grupo** (05/10/2026, pedido do usuário): nas quatro abas
  de grupos sem pagamento, o grupo aberto com **2+ protocolos** mostra "Manter
  pendente" **em cada linha** (antes, por linha, só no rejeitado "a conferir"). Grava
  só aquele protocolo; ele vira avulso (selo "pendente confirmado") e o grupo segue
  sem ele — "Enviar para resolvidos" do grupo passa a levar só os demais. Caso que
  motivou: 534041 (R$ 1.299,50) sem relação com 534106 + 534796 (mesmo processo,
  R$ 433,17).
- **Protocolo novo no grupo depois da marcação** (05/10/2026, pedido do usuário): a
  marcação vale para os protocolos que existiam quando foi feita. Se entra no mesmo
  grupo (nome + Prec-cp + Nr BI + ano) um protocolo com **data posterior ao dia da
  marcação** (horário de Brasília), ele pode ser a tentativa corrigida do mantido. A
  separação em avulsos continua automática; o painel só **avisa**: selo "protocolo
  novo no grupo" no cartão (e no PDF), quadro com os novos no grupo aberto e aviso na
  linha da aba "Mantidos pendentes". Caso que motivou: 534106 (R$ 433,17, rejeitado)
  mantido junto com o 534041 em 29/09; em 30/09 entrou o 534796 (R$ 433,17, em curso)
  e o grupo se desfez sem aviso. No código: `NOVOS_MANT` no `painel.html`.

## Observação do grupo — botão "Obs" (07/10/2026, pedido do usuário)

Nas abas **"DEA encerrado sem pagamento"**, **"DEA pendente de análise CPEx"**,
**"Entre anos — encerrado sem pagamento"** e **"Entre anos — pendente de análise
CPEx"**, o grupo **aberto** mostra o botão **"Obs"** (só para o administrador), que
abre um campo de **até 150 caracteres** para uma observação livre. Sem data, sem
nome de quem registrou e sem senha (basta a sessão de administrador). A observação
salva aparece em destaque no grupo aberto — também para o leitor —, nunca no
cartão fechado. Campo vazio + "Salvar" apaga.

- Lista própria `manual/observacoes.json` no bucket privado (`{observacoes, log}`;
  texto no campo `motivo`), anexada ao `dados.js` como `window.DEA_OBS` (em dev:
  `observacoes-manuais.json`). Ação `salvar-obs` do `/api/dea`. O `log` guarda a
  hora de cada alteração (auditoria), mas o painel não a mostra.
- Salvar não recarrega o painel: o pedido vai por `postMessage` para a casca, que
  grava e responde (`dea-obs-resultado`); o painel atualiza o grupo na hora.
- Uma observação por conjunto de protocolos. O grupo mostra, nesta ordem: a dos
  **mesmos protocolos**; a de um grupo **contido** nele (entrou protocolo novo); a
  de um grupo que o **contém** (o protocolo foi separado com "Manter pendente").
  Salvar substitui a dos mesmos protocolos e as contidas no grupo; a do grupo de
  origem (que o contém) fica para os demais protocolos.

## Ações do administrador sem senha (07/10/2026, pedido do usuário)

O login com `DEA_ADMIN_PASSWORD` já identifica o administrador; nenhuma ação do
painel pede a senha de novo. Vale para "Enviar para resolvidos", "Manter pendente",
"Registrar mês da folha" e os três "Desfazer" (o "Lançado no SIPPES" já era assim).
O `/api/dea` exige só a **sessão de administrador** (cookie HMAC, até 8h) e mantém o
limite de tentativas por IP; motivo, mês da folha e as demais validações seguem
iguais. Antes era "dupla trava" (sessão + senha redigitada).

## Resolvidos manualmente (21/09/2026)

O administrador pode tirar do painel um grupo sem pagamento que ele conferiu
(ex.: o crédito saiu em outro Nr BI). No grupo aberto aparece **"Enviar para
resolvidos"** — só para a sessão de administrador —, que pede **motivo** (mínimo
de 5 caracteres). A aba **"Resolvidos manualmente"** lista os marcados e, para o
administrador, tem **"Desfazer"**. (Até 07/10/2026 as duas ações pediam a senha de
administrador de novo — ver "Ações do administrador sem senha".)

Como funciona, e por quê:

- **O painel não faz requisições** (CSP `connect-src 'none'`). O botão manda um
  `postMessage` para a casca (`DeaDashboard.tsx`), que valida a origem e o iframe,
  abre a janela do pedido (motivo) e chama `POST /api/dea {acao:'resolver'|'desfazer-resolvido'}`.
- O servidor exige **sessão de admin** (até 07/10/2026, também a `DEA_ADMIN_PASSWORD`
  redigitada), com limite
  de 30 tentativas por IP a cada 10 min, e grava em `manual/resolvidos.json` no
  bucket privado `dea-privado` — **fora de `estado/`**, então o pipeline não lê nem
  sobrescreve. O arquivo tem `resolvidos` (a lista vigente) e `log` (tudo que foi
  marcado/desfeito, com motivo e hora — é a trilha de auditoria; não apague).
- A lista chega ao painel **anexada ao `dados.js`** pelo `/api/dea`
  (`window.DEA_RESOLVIDOS`, e `window.DEA_ADMIN` com o papel da sessão). Não é
  preciso rodar a atualização: vale na hora.
- O grupo some quando **todos** os protocolos dele estão na lista. Se entrar um
  protocolo novo no grupo, ele **volta a aparecer** (é uma tentativa nova, merece
  olhar). O registro guarda os protocolos, não o id do grupo, por isso resiste a
  mudanças no agrupamento.
- Se o servidor não conseguir ler a lista, o painel mostra o aviso do topo e o
  contador da aba fica "—" (os grupos marcados reaparecem até recarregar).
- Em dev com `DEA_DADOS_LOCAL`, a lista fica em `resolvidos-manuais.json`, ao lado
  do `dados.js` local.

## Aba "Homologados para lançamento"

### Só o ano corrente — 14/10/2026 (pedido do usuário)

O recorte fixo "DEA 2026 em diante" (`HL_ANO_MIN`) virou **só a aba DEA do ano
corrente** (`HL_ANO`): o sistema de pagamento não autoriza protocolo de ano
diferente do corrente. O ano é o do retrato (`META.data_ref`), o mesmo critério de
"Alterações do dia"; sem ele, o ano da data do navegador. Vale para os dois pares
de situação. Na virada para 2027 os protocolos da DEA 2026 saem da lista (os
"Lançamentos registrados" continuam visíveis). Onde abaixo se lê "DEA 2026 em
diante" / `HL_ANO_MIN`, passou a valer esta regra.

### Homologado reconhecido também pelo texto — 14/10/2026 (pedido do usuário)

"Se na situação DEA aparecer 'Homologado pelo OD do CPEx / Lançar no SIPPES', o
protocolo aparece em Homologados para lançamento, independente do
Acompanhamento." O painel reconhece o caso pelo código `HOMOLOGADO` **ou** pelo
texto da situação DEA começando com "Homologado pelo OD do CPEx" (sem acento e
pontuação; `homologadoNaDea` no `painel.html`). Motivo: uma redação nova na
planilha, que o `MAPA_SITUACAO` do `build_data.py` não conhece, vira
`ANDAMENTO_OUTRO` com o texto original como rótulo — a tela mostra "Homologado…",
mas o código não bate, e o protocolo ficava de fora (suspeita no caso do
521738). O recorte do ano corrente continua valendo. O aviso "Situações não
previstas no mapa" do rodapé de dados mostra se isso está acontecendo.

### Acréscimo de 14/10/2026 (pedido do usuário)

**"Homologado pelo OD do CPEx / Lançar no SIPPES"** (`HOMOLOGADO`) na aba DEA
passou a **bastar** para o protocolo entrar na aba, qualquer que seja a situação
no Acompanhamento (antes exigia "Processado o Pagamento"). O resto da regra não
mudou: só DEA 2026 em diante (`HL_ANO_MIN`), sai ao registrar o mês da folha, e o
par `AUTORIZADO_CPEX` + `PAGO` continua igual. No código: `['HOMOLOGADO', null]`
em `HL_PARES` (`null` = qualquer Acompanhamento). Motivo: protocolos homologados
apareciam em "DEA pendente de análise CPEx" sem constar aqui, porque o
Acompanhamento ainda não estava em "Processado o Pagamento". As demais abas não
mudam.

### Acréscimo de 05/10/2026 (pedido do usuário)

Além do par abaixo, a aba lista também os protocolos com **"Homologado pelo OD do
CPEx / Lançar no SIPPES"** (`HOMOLOGADO`) na aba DEA **e** **"Processado o
Pagamento"** (`PGTO_PROCESSADO`) no Acompanhamento — mesmo recorte de ano
(`HL_ANO_MIN`), mesmo registro do mês da folha. No código: `HL_PARES` no
`painel.html`. Esses protocolos já não contavam como pagos nas demais abas
(`PGTO_PROCESSADO` é classe "andamento"), e isso não muda.

### Regra vigente desde 29/09/2026 (pedido do usuário)

Houve mudança de termos nas colunas de situação das planilhas. O protocolo liberado
pelo CPEx fica na aba DEA como **"Pagamento autorizado (CPEx) / Aguardando
lançamento no SIPPES"** (`AUTORIZADO_CPEX`) e o Acompanhamento **já o dá como
"Pago"** (`PAGO`) — mas ele **ainda não foi pago**: falta a OM lançar no
SIPPES/SIAPPES. A aba passou a listar exatamente os protocolos com **esses dois
termos juntos**, só das abas **DEA 2026 em diante** (`HL_ANO_MIN`; 2024 e 2025 já
foram lançados, decisão do usuário). Retrato de 29/09/2026: 115 protocolos
(DEA 2024: 523 e DEA 2025: 397 ficam de fora).

- Depois do pagamento de fato, o administrador **registra o mês da folha** — por
  protocolo (o registro em lote saiu em 05/10/2026) — só com a sessão de administrador; o
  protocolo sai da lista e vai para **"Lançamentos registrados"** (na mesma aba),
  onde o registro pode ser **desfeito**. Observação opcional.
- Lista manual própria: `manual/lancados.json` no bucket privado (`{lancados, log}`,
  com `mes_folha` "AAAA-MM"), anexada ao `dados.js` como `window.DEA_LANCADOS`
  (em dev: `lancados-manuais.json`). Ações do `/api/dea`: `registrar-lancamento` e
  `desfazer-lancamento`; o servidor recusa protocolo já registrado.
- **"Lançado no SIPPES"** (05/10/2026, pedido do usuário): etapa anterior ao mês
  da folha. Botão acima de "Registrar mês da folha", em cada protocolo: o
  administrador informa o **mês/ano de referência** do pagamento e o **nome do
  operador** (até 15 caracteres) que lançou no SIPPES. O protocolo **continua** em
  "Homologados para lançamento"; o botão fica **verde** (cinza enquanto não lançado)
  e mostra os dados ao passar o mouse. Clicar de novo corrige o registro (substitui).
  Basta a sessão de administrador — **sem** redigitar a senha (decisão do usuário).
  Lista própria `manual/sippes.json` (`{sippes, log}`, um registro por protocolo;
  `mes_folha` = mês de referência, `operador`), anexada como `window.DEA_SIPPES`
  (em dev: `sippes-manuais.json`); ação `registrar-sippes` do `/api/dea`. Ao
  registrar o mês da folha, o campo vem preenchido com o mês de referência e o
  registro em `lancados.json` ganha `sippes` (cópia de mês ref. e operador),
  exibido em "Lançamentos registrados". Registros de `lancados.json` anteriores
  não foram alterados.
- Calculado **no painel** a partir de `processos`; o `homologados_idx` e os
  `agregados["hl_*"]` do `build_data.py` (regra anterior) deixaram de ser lidos pela
  aba. O número "homologados" gravado no Histórico pelo pipeline segue a regra
  anterior.
- **As demais abas não mudam** (decisão do usuário): esses protocolos continuam
  contando como pagos em grupos, "Rejeitado em grupo pago" e no aviso de pago em
  outro BI, porque a situação efetiva vem do Acompanhamento ("Pago").

### Regra anterior (16/09/2026)

Processos das abas DEA com situação **"Pagamento autorizado (CPEx). Aguardando
lançamento da OM no SIPPES"** ou **"Homologado pelo OD do CPEx. Efetuar
lançamento no SIPPES até o final da 2ª corrida / SIAPPES Automático"** que
**ainda não foram pagos** — no Acompanhamento constam como "Processado o
Pagamento". É a fila de lançamento no SIPPES/SIAPPES.

Os que já constam como **"Pago"** ficam **fora** da lista (estão encerrados), mas
o painel mostra ao pé da tabela quantos foram excluídos, para o número
permanecer rastreável. No código: `homologados` = situação DEA homologada e
`sit_efetiva_classe != "pago"`; `agregados["hl_ja_pagos"]` conta os excluídos.

Retrato de 16/09/2026: **15 prontos, R$ 6.664,00**; 100 excluídos por já
constarem "Pago". Os 15 são um lote recente (protocolos de 04 a 10/09/2026,
valores de R$ 45,21 a R$ 1.109,66).

Desde 21/09/2026, por pedido do usuário, a tabela (tela e PDF) **não tem mais as
colunas Segmento e Situação — Acompanhamento**; fica só a situação da aba DEA. O
filtro de segmento da barra do topo continua valendo, e a regra que tira da lista
os já "Pago" no Acompanhamento não mudou.

**Premissa que não se confirmou:** chegou-se a supor que "não pago ⇒ não está no
Acompanhamento". Falso — os 115 liberados pelo CPEx têm linha lá. O que ocorre é
que **a coluna de situação das abas DEA não é atualizada depois do pagamento**,
e esses 115 são a maior fatia das divergências entre as duas abas.

## Aba "Alterações do dia" (regra de 21/09/2026)

Por pedido do usuário, a aba mostra **só as mudanças de situação na aba DEA do
ano corrente** da planilha (o ano da data do sistema; hoje "DEA 2026"), mais os
protocolos que **saíram** dessa aba. Ficaram de fora as mudanças da aba
Acompanhamento e o quadro "Entrada" (novos protocolos).

- A aba é identificada pelo **nome da aba** da planilha (`p["aba"] == "DEA <ano>"`),
  não pela Data Implantação. Na virada para 2027 é preciso acrescentar
  "DEA 2027" em `ABAS_DEA`; sem isso a comparação fica vazia.
- **Compilação por dia do sistema:** a comparação é sempre contra o **último
  retrato de um dia anterior** (`base_do_dia`). Várias atualizações no mesmo dia
  comparam todas com essa mesma base, e as mudanças se acumulam; no dia seguinte
  a base passa a ser o último retrato de hoje. O snapshot leva essa base adiante
  no campo `base_dia` (só `data`, `ano_corrente`, `dea_corrente` e `dea2026`).
- No **primeiro dia** (sem retrato de dia anterior), a 2ª rodada compara com a 1ª
  do mesmo dia. Snapshot gravado antes desta regra não tem `dea_corrente` nem
  `base_dia`: para 2026 o diff usa o `dea2026` antigo como reserva.
- `calcular_diff_dia()` gera o `diff` do `dados.js`, com as mudanças na chave
  `dea2026` (compatibilidade com o painel) e o ano em `ano`.
- A aba **Histórico não mudou**: continua com uma entrada por execução, comparada
  com a execução anterior, com Acompanhamento, DEA 2026 e novos
  (`calcular_diff()`).

Testado em 21/09/2026 simulando cinco rodadas em dois dias: as duas rodadas
extras do 1º dia acumularam as mudanças; a 1ª do dia seguinte comparou com o
último retrato da véspera; mudança em DEA 2025, no Acompanhamento e protocolo
novo não apareceram.

## Aba "Histórico" (16/09/2026)

Registro do que mudou a cada atualização, agrupado por dia — não só o dia
anterior. Fica em `claude/dea/historico.json` no projeto e é **lido e reescrito**
a cada execução (`--hist`).

Decisões que importam:

- **Uma entrada por EXECUÇÃO, não por dia.** Se o painel for regenerado duas
  vezes no mesmo dia, as duas ficam registradas e a tela agrupa por data.
  Substituir por dia perderia as mudanças da primeira execução, já que cada
  rodada compara com o retrato da anterior.
- **A execução sem base de comparação não é registrada** — ela não representa
  "o que mudou", só o ponto de partida.
- **Limites de tamanho:** `MAX_ENTRADAS = 400` execuções (~1,5 ano de dias
  úteis); as mais antigas que `MAX_DETALHE = 90` perdem a lista de mudanças e
  guardam só as contagens (`resumido: true`). A tela avisa quando um dia está
  resumido, e o recorte por segmento não se aplica a esses.
- O histórico **começou em 16/09/2026**. As rodadas anteriores não foram
  guardadas e não há como reconstruí-las — a tela diz isso.

## Faixa de indicadores — removida (17/09/2026)

O painel teve, entre o cabeçalho e a barra de segmento, uma faixa de oito
cartões (grupos em risco, em risco entre anos, homologados, processos,
divergências, aguardando o CPEx, grupos resolvidos, alterações do dia). **O
usuário pediu a exclusão dela**, mantendo apenas os três botões de segmento.

Nada se perdeu: os números que a faixa mostrava continuam nos **contadores das
abas** (o selo ao lado de cada nome) e nos cabeçalhos de cada tela, que já
respeitam o recorte por segmento. Foram removidos o elemento `.kpis`, o bloco de
CSS dos cartões e a função `renderKPIs()`.

No lugar ficou `<p class="aviso-topo" id="avisoTopo" hidden>`, que só aparece
quando `window.DEA_DATA` não carrega — antes esse aviso era desenhado como um
cartão dentro da faixa. **Não apague esse parágrafo junto**: sem ele, uma falha
de carregamento do `dados.js` deixa a página muda.

## Filtro de segmento (16/09/2026)

Barra logo abaixo do cabeçalho — desde 17/09/2026 é o primeiro elemento da
página —, aplicada a **todas** as telas: **Veteranos** (Prec-cp começando em 96),
**Pensionistas** (98) e **Ativa** (demais).
`segmento_de()` no pipeline; no painel, `recortar()` recalcula `V.P`, `V.G`,
`V.EA`, `V.PF`, `V.HL`, `V.HIST` e `V.DIFF`, e `aplicarSegmento()` redesenha
contadores das abas, listas, gráfico e relatórios. Nada lê os totais
globais de `agregados` para exibir — senão o recorte e o número na tela se
contradizem. Distribuição em 16/09/2026: Ativa 2.439, Pensionistas 753,
Veteranos 200.

Desde 22/09/2026, a pedido do usuário, os botões vêm na ordem **Ativa,
Veteranos, Pensionistas**, sem o texto do prefixo ("96…", "98…", "demais") no
rótulo, e a página abre **só com Ativa marcada** (`SEG` inicial); Veteranos e
Pensionistas começam desmarcados.

## Ano do processo

Vem da **Data Implantação**, não do nome da aba. Em 14/09/2026 a aba `DEA 2022`
continha, além dos 365 registros de 2022, uma cópia integral dos 613 de 2023 —
o usuário corrigiu a planilha na origem. O script continua ignorando a segunda
ocorrência de um protocolo repetido e avisa quando isso acontece.

## Situação "envio pela DAP" (acrescentada em 15/09/2026)

Texto integral na planilha (aba DEA 2026):

> `4 - Analisado / Aguardando envio pela DAP, para Homologação do CPEx (A OM ainda não deverá efetuar o lançamento no SIPPES`

Mapeada como `AGUARDANDO_ENVIO_DAP`, classe `andamento`. Duas armadilhas que
custaram uma rodada e ficam registradas:

1. **O aviso de situação não prevista trunca o texto em 60 caracteres**
   (`k[:60]` em `meta.avisos`). A primeira tentativa usou a chave curta que
   aparecia no aviso e não casou com nada. Ao mapear situação nova, leia o valor
   **da planilha**, não o do aviso. O mapa guarda as duas chaves — a completa e a
   curta, como reserva caso a planilha deixe de trazer o parêntese final.

2. **Posição no fluxo: empatada com `AGUARDANDO_HOMOLOGACAO` (ambas 3).**
   Pela leitura literal, "aguardando envio pela DAP" precede "aguardando
   homologação do CPEx", o que faria a transição sair como **retrocesso**. Mas
   em 15/09/2026 os 17 processos que estavam no texto antigo migraram **todos**
   para o novo, sem sobrar nenhum no anterior — é troca de redação da mesma
   etapa "4 -" do sistema, não regressão de 17 processos. Empatadas, a mudança
   sai como `lateral` e o painel não pinta 17 setas vermelhas falsas. Se algum
   dia os dois textos passarem a conviver, com processos andando de um para o
   outro, reveja essa decisão.

## Aba "Aguardando envio pela DAP" — criada e removida (22–23/09/2026)

Existiu por um dia, entre "Alterações do dia" e "Fila de homologação": listava os
protocolos com situação `AGUARDANDO_ENVIO_DAP` na aba DEA ainda não pagos, para
apoiar a rotina de remessa. **Em 23/09/2026 o usuário pediu a exclusão** — não
era mais necessária. Fica o registro para não ser recriada por engano.

O código está no commit `6bdc6fc` (removido no commit seguinte): era calculado só
no painel, a partir do `sit_dea_cod` que o `dados.js` já traz, sem nada no
`build_data.py`. Se um dia voltar a fazer falta, é de lá que se recupera.

## Relatório "Perfil das rejeições — DEA 2026" (23/09/2026)

Botão na **Visão geral**, no cartão logo abaixo de "Cobertura do cruzamento".
Pedido pelo usuário para orientar quem elabora os processos sobre o que mais
derruba protocolo. Lê a coluna **Parecer** dos protocolos com
`sit_dea_classe === 'rejeitado'` na aba **DEA 2026** (`p.aba`, não o ano da Data
Implantação) — é na aba DEA que o parecer é escrito. Respeita o segmento.

Cinco seções: resumo 80/20, motivos agrupados, termos recorrentes, reincidência
por militar (mesmo nome + Prec-cp, pela `chavePessoa`) e anexo com os pareceres
na íntegra.

O **resumo 80/20 (Pareto)**, acrescentado a pedido do usuário em 23/09/2026,
**mede** a concentração em vez de pressupô-la: `rejPareto()` acumula os motivos
em ordem de frequência, marca onde os 80% se completam e imprime também quanto
os 20% do topo realmente explicam. Quando os motivos estão pulverizados — o
corte dos 80% cai além de ~35% dos motivos distintos — o texto **diz que a
concentração não se confirma** e manda o leitor para a seção de termos. Nunca
afirmar "80% vêm de 20%" sem esse teste: com pareceres de redação livre o padrão
pode simplesmente não existir.
Duas decisões que sustentam o relatório e não devem ser desfeitas sem pensar:

- **Agrupamento por texto normalizado** (`motivoChave`): sem acento, sem
  pontuação e com **todo número virando `#`**. É isso que faz "valor R$ 1.234
  diverge" e "valor R$ 987 diverge" caírem no mesmo motivo. O exemplo exibido é
  a redação mais curta do grupo; o número de variações vai como nota.
- **Os pares de palavras saem adjacentes no texto original.** Filtrar as
  stopwords antes de formar os pares produzia expressões que ninguém escreveu
  ("publicacao concessao", de "publicação em BI do ato de concessão"). Os termos
  são contados por **frequência de documento** — em quantos pareceres aparecem,
  não quantas vezes ao todo.

Nenhuma taxonomia de erro é criada pelo painel: tudo sai do texto. Se o ranking
vier pulverizado (cada parecer com redação própria), é a seção de termos que
responde "qual o erro mais comum" — foi por isso que ela existe. A lista
`STOP_REJ` pode precisar de ajuste quando confrontada com os pareceres reais.

## Relatórios em PDF (15/09/2026)

As abas "Prec-cp repetido", "Entre anos", "Pago em outro ano", "Histórico",
"Homologados para lançamento" e "Alterações do dia" têm um botão **Relatório
PDF**. Não há biblioteca de PDF: o painel monta um documento A4 no próprio DOM
(`#relatorio`, classe `modo-relatorio` no `body`) e chama `window.print()`. Se o
`print()` programático for bloqueado pelo sandbox do artifact, a pré-visualização
fica na tela com a barra "Salvar em PDF" e o Ctrl+P resolve — por isso o botão
nunca falha em silêncio.

Decisões de layout que custaram iteração e não devem ser desfeitas sem motivo:

- **Tabela com `table-layout:auto` e cabeçalho curto** ("Situação (DEA)",
  "Situação (Acomp.)"). Com largura fixa, as colunas de data e valor, que não
  quebram, empurram a tabela para fora da margem; com cabeçalho longo, a coluna
  do Acompanhamento rouba a largura da coluna da DEA.
- **Dentro da tabela a situação é texto com filete lateral, não pílula.** A
  pílula com `padding` + `inline-block` quebrava "Analisado e Rejeitado /
  Restituído à OM/OP" em quatro linhas e levava o relatório de 36 para 47
  páginas. As pílulas continuam no cabeçalho do grupo, onde há espaço.
- **A explicação do veredito é legenda na folha de rosto, não parágrafo por
  grupo.** Repetida 89 vezes custava ~6 páginas e não acrescentava nada.
- **`overflow-wrap:anywhere` só no parecer.** Aplicado à tabela inteira, partia
  nomes no meio ("NAZA RIO BARB OSA").
- **"Alterações do dia", "Histórico" e "Homologados" saem em paisagem**
  (`@page paisagem` + classe na `.relatorio`): são oito a dez colunas, e em
  retrato a coluna Nome fica impraticável.
- Pareceres vazios ou "ND" não viram linha (`temParecer()`).

Os filtros da tela **e o segmento ativo** valem para o documento, e a folha de
rosto diz qual recorte foi usado. Referência de tamanho no retrato de
15/09/2026: grupos 36 páginas, entre anos 6, pago em outro ano 9, alterações do
dia 4.

## Aba "Fila de homologação" (19/09/2026)

Origem: aba **`Protocolos para homologação`** da mesma planilha, criada pelo usuário
em 19/09/2026. Fica no painel **logo depois de "Alterações do dia"**, por pedido dele.

São processos que o operador já registrou e que **ainda não chegaram ao
homologador** — a lacuna entre "protocolado" e "homologado". Retrato de estreia:
**38 protocolos, R$ 38.487,58**, todos "Protocolado e Aguardando Análise", nenhum
com linha no Acompanhamento, e os 38 casam com as abas DEA pelo protocolo.

Colunas da aba (a coluna A vem vazia):
`B Protocolo | C Tipo | D Unidade Gestora | E Codom Vinculado | F Sigla Codom | G Prec-CP | H Nome | I Valor Corrigido`

**A coluna Prec-CP da aba vem vazia em todas as linhas.** O painel pega o Prec-cp
do cruzamento com as abas DEA — é dele que sai o segmento (Veteranos/Pensionistas/
Ativa), então o filtro de segmento funciona normalmente aqui.

### Os dois relógios — e por que são dois

**A aba não tem coluna de data.** Sem isso não há como saber há quanto tempo um
protocolo espera, então o painel passa a medir por conta própria:

- **`dias_fila`** — desde o dia em que o protocolo apareceu **nesta aba**. É o que
  dispara o alerta de `DIAS_ALERTA_FILA = 2` dias. O pipeline guarda no snapshot
  `homolog` (quem estava na fila) e `homolog_visto` (`{protocolo: primeira data vista}`);
  quem já estava conserva a data original, quem chega recebe a data de hoje.
  **Só passa a valer da segunda execução em diante** — na primeira, `primeira_vez`
  é `True`, `dias_fila` fica `None` e o painel mostra a faixa "Primeira leitura
  desta fila" em vez de alertas falsos.
- **`dias_protocolo`** — desde a **Data Implantação** das abas DEA. É só contexto.

**Por que o segundo não serve de alerta:** na leitura de estreia os 38 já tinham
2 ou mais dias por esse relógio — mediana **123 dias**, máximo **586**
(protocolos 454407, 454463, 454474 e 454484, de 10/02/2025; e ainda 568, 397 e
292 dias). Um alerta que marca a tabela inteira todo dia não alerta nada. Ele fica
como coluna, para os casos gritantes aparecerem sem poluir o alerta diário.

Decisões do usuário em 19/09/2026: **os dois relógios** (alerta pela fila, coluna
pela protocolização) e **dias corridos**, não dias úteis.

### O que a tela mostra

**Desde 21/09/2026, por pedido do usuário**, saíram as três faixas do topo
("Novos na fila", "Parados há 2 dias ou mais", "Saíram da fila"), os filtros
"Mostrar" ("Só os parados" / "Só os novos") e a coluna **Segmento** da tabela
(tela e PDF). O filtro de segmento da barra do topo continua valendo para a aba.
Só a faixa "Primeira leitura desta fila" ficou, porque aparece apenas quando o
relógio da fila ainda não tem base.

O pipeline não mudou: `novos`, `alerta` e `saidos` continuam no `dados.js`. Na
tela, o alerta segue visível pelo selo colorido de "Na fila há", pelo selo "novo"
ao lado do protocolo e pela aba, que fica vermelha quando há alguém parado; a
capa do PDF mantém os totais de parados e novos.

A tabela é ordenada **do que espera há mais tempo para o mais recente**, com
busca e Relatório PDF (paisagem). O selo da aba mostra quantos estão na fila.

### Cuidados

- `ler_homologacao()` devolve `None` se a aba sumir da planilha; o painel mostra a
  seção como indisponível em vez de quebrar. **Não transforme isso em exceção.**
- O `homolog_visto` guarda **apenas quem está na fila hoje**, para o arquivo não
  crescer sem limite. Se um protocolo sair e voltar, o relógio dele recomeça — o
  que é o comportamento certo, já que é uma nova entrada na fila.
- O campo `visto` existe no objeto em memória mas **não vai para o `dados.js`**
  (é estado do snapshot, não da tela).
- Testado em 19/09/2026 simulando a segunda execução (`--data-ref` dois dias à
  frente, com um protocolo removido e um fantasma no retrato anterior): o novo
  entrou com 0 dias e **ficou de fora do alerta**, o fantasma apareceu em "Saíram",
  e os 37 restantes dispararam o alerta. Repita essa simulação se mexer na regra.

## Filtro "Atalhos" da Consulta de processos — removido (21/09/2026)

O usuário pediu a exclusão do filtro **Atalhos** ("Só divergentes" e "Aguardando
CPEx") da aba Consulta de processos. Saíram os dois chips, os campos `div`/`sem`
de `fEstado` e as linhas correspondentes do filtro e do "Limpar". Os dados
(`divergente`, `tem_acomp`) continuam no `dados.js` e na Visão geral.

## Botões "Copiar CSV" — removidos (19/09/2026)

O usuário pediu a exclusão de **todos** eles. Eram três: **Consulta de processos**,
**Homologados para lançamento** e **Fila de homologação**. Saíram os botões, os
três handlers, os `<span>` de aviso que só serviam a eles (`f-csv-aviso`,
`hl-aviso`, `fl-aviso`) e a linha de `renderHL()` que escondia o botão quando a
lista estava vazia.

Detalhe de layout que quase passou batido: em Homologados o `style="margin-left:auto"`
morava no botão do CSV e era ele que empurrava a barra para a direita. **Esse estilo
foi transferido para o botão "Relatório PDF"** — se algum dia ele sumir do
`hl-pdf`, a barra volta a ficar colada à esquerda.

Os relatórios PDF continuam em todas as abas: eram o outro caminho de exportação
e não foram tocados.

## Fuso horário — Brasília (19/09/2026)

O container roda em **UTC**; a OM trabalha no horário de Brasília. O painel vinha
carimbando "Atualizado em 13:09" numa execução que, para o usuário, eram 10:09.

Correção no `build_data.py`: `agora_local()` devolve a hora de
**`America/Sao_Paulo`** via `zoneinfo`, com reserva num offset fixo de `-03:00`
caso o `tzdata` falte no container (o Brasil não tem horário de verão desde 2019,
então a reserva é segura). O `.replace(tzinfo=None)` no fim é proposital: sem ele
o `isoformat()` passaria a incluir o offset e **mudaria o formato do `id` das
entradas do histórico**.

Dois pontos passaram a usar essa função: o carimbo `gerado_em`/`gerado_em_iso` e a
**`data_ref`** — esta última importa, porque perto da meia-noite a data em UTC e a
data em Brasília são diferentes, e é a `data_ref` que agrupa o histórico por dia.

**Migração feita na mesma data:** todas as entradas antigas do `historico.json`
foram geradas com `datetime.now()` em UTC, então bastou subtrair 3h de `id` e
`gerado_em` de cada uma, conferindo que nenhuma mudava de dia. O resultado bate
com a realidade: a execução agendada de 17/09 passou a marcar **09:07**, coerente
com o agendamento das 09:00. Se aparecer alguma entrada com hora adiantada em
~3h, é resquício anterior à correção.

## Atualização — MANUAL pelo administrador (desde 21/09/2026)

No site (sispagpesbadm.com) **não há mais agendamento**. O administrador entra
no painel com a senha de admin (`DEA_ADMIN_PASSWORD`) e clica em **"Atualizar"**
uma vez por dia útil. O botão dispara o workflow `dea-atualizar.yml` no GitHub
Actions, que roda o `atualizar.py` intocado. Diferente do botão antigo (citado
abaixo), este traz dado novo de verdade: quem lê a planilha é a conta de serviço,
no GitHub.

Consequências de depender do clique:

- **Dia sem clique = painel parado**, e o carimbo "Atualizado em" mostra isso.
  Na rodada seguinte, "Alterações do dia" compara com o último retrato do
  último dia com atualização, então junta as mudanças de todos os dias sem
  atualização.
- **"Dias na fila" subestima** um protocolo que entrou na homologação num dia
  sem atualização: ele conta a partir da primeira rodada que o viu.
- **Dois cliques no mesmo dia** geram duas entradas no histórico. O painel agrupa
  por data (é o comportamento previsto). O servidor recusa um disparo enquanto
  outro estiver em andamento.

O texto abaixo descreve o regime anterior e fica como histórico.

### Regime anterior — automática às 09:00 (16/09/2026 a 21/09/2026)

Tarefa agendada **`trig_01Az1jw4RwQWx4mgb9WA2huz`**, 09:00 em dias úteis
(cron `0 12 * * 1-5`, em UTC). Substitui a `trig_01MLfwiB65JFXNgKUqsQ2vdL`, que
foi excluída e recriada; se aparecer referência à antiga em algum lugar, está
desatualizada.

**Não há botão de atualização manual no painel.** Ele existiu e foi removido:
uma página publicada não tem credencial para a planilha privada, então o botão
só recarregava a página, sem trazer dado novo — e prometia uma releitura que não
fazia. A atualização é a tarefa agendada (que pode ser disparada sob demanda) ou
um pedido de regeneração numa conversa.

O que cada execução faz:

1. Baixa a planilha (fileId acima) como `.xlsx` via Google Drive e decodifica o
   base64 **sem despejar o conteúdo no contexto**.
2. Recupera do projeto `build_data.py`, `snapshot-anterior.json` e
   `historico.json`.
3. `python3 build_data.py --xlsx DEA.xlsx --prev snapshot-anterior.json --hist historico.json --outdir out`
   — a mesma execução já lê a aba `Protocolos para homologação` e monta a fila.
4. **Lê** o artifact `https://claude.ai/artifact/2vNU9QXMhE2UB1Xa9wAH5d` antes de
   republicar (a publicação é recusada sem isso) e **mescla** sobre o que está
   publicado — outra sessão pode ter acrescentado algo, como aconteceu com os
   relatórios em PDF, que quase foram destruídos por uma republicação cega.
   Nunca use `force`.
5. Republica com `url` = esse endereço e `files` = `{"dados.js": ...}`.
6. **Regrava no projeto `snapshot-anterior.json` E `historico.json`.** São esses
   dois passos que fazem o campo "Alterações" comparar com o estado certo na
   próxima vez e que mantêm a aba Histórico. Sem o primeiro, o diff repete
   mudanças já reportadas; sem o segundo, o histórico não cresce.
   Desde 19/09/2026 o `snapshot-anterior.json` carrega também `homolog` e
   `homolog_visto`: **é só por causa deles que existe o "dias na fila"**. Perder
   esse arquivo zera o relógio da fila de homologação (o painel volta a mostrar
   "Primeira leitura") sem que nada mais no painel acuse o problema.
