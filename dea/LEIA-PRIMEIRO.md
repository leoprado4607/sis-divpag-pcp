# Painel DEA — pacote de migração para o sispagpesbadm.com

Preparado em 19/09/2026 para migrar o Painel DEA da B Adm Gu Natal para a
ferramenta **"Exercícios Anteriores"**, mantendo a restrição de acesso.

> **Isto é um PORT, não uma reconstrução.** O `build_data.py` e o `painel.html`
> vêm prontos e testados contra os 3.421 processos reais. Toda a lógica de
> negócio deve continuar **byte a byte igual** — é isso que garante que os
> números do servidor sejam os mesmos do painel atual. A adaptação ao servidor
> acontece em arquivos novos, que não tocam nas regras.

---

## 1. O que vem no pacote

```
painel-dea/
├── LEIA-PRIMEIRO.md          este arquivo
├── app/
│   ├── build_data.py         PIPELINE — NÃO MODIFICAR (regras de negócio)
│   ├── painel.html           PAINEL — NÃO MODIFICAR (a página inteira)
│   ├── dados.js              saída de 19/09; serve para testar a rota antes do pipeline
│   ├── drive_download.py     NOVO — baixa a planilha via conta de serviço
│   └── atualizar.py          NOVO — orquestrador chamado pelo cron
├── estado/
│   ├── snapshot-anterior.json   NÃO REGENERÁVEL — ver §5
│   └── historico.json           NÃO REGENERÁVEL — ver §5
├── docs/
│   ├── NOTAS-DOMINIO.md      regras de negócio e todas as decisões, com o porquê
│   ├── IDENTIDADE-VISUAL.md  paleta, tipografia, componentes, impressão
│   └── RETRATO-ATUAL.md      números de referência para conferir o port
└── testes/
    └── comparar_saidas.py    teste de aceitação: o port reproduz a análise?
```

---

## 2. A instrução para colar no projeto do site

Copie o bloco abaixo inteiro e cole no Claude Code do servidor, depois de ter
colocado a pasta `painel-dea/` em algum lugar acessível a ele.

```
Preciso integrar um painel já pronto e testado à ferramenta "Exercícios
Anteriores" deste site, mantendo a restrição de acesso que ela já tem.

O pacote está em ./painel-dea/ (ajuste o caminho se for outro).

ANTES DE QUALQUER COISA, leia, nesta ordem:
  1. painel-dea/LEIA-PRIMEIRO.md
  2. painel-dea/docs/NOTAS-DOMINIO.md

O NOTAS-DOMINIO.md é a especificação do domínio. Ele registra decisões que
contrariam a intuição e que já foram medidas contra os dados reais. Exemplos:
"Processado o Pagamento" NÃO é pagamento concluído; pagamento em ano posterior
tira um grupo do risco, mas pagamento em ano anterior não; o ano do processo vem
da Data Implantação e não do nome da aba. Não reinterprete nenhuma dessas regras.

REGRA PRINCIPAL: não altere build_data.py nem painel.html. Eles estão testados
contra 3.421 processos e os números que produzem são a referência. Se você achar
que precisa mudar algo neles, PARE e me pergunte antes.

Faça apenas estas quatro coisas:

(1) RECONHECIMENTO, só leitura. Me diga, antes de escrever qualquer código:
    - qual a stack do site e qual servidor web está na frente;
    - como a ferramenta "Exercícios Anteriores" restringe o acesso hoje
      (sessão da aplicação, .htpasswd, LDAP, middleware?) e em qual arquivo
      isso está implementado;
    - de onde o site serve arquivos estáticos e se existe algum caminho já
      protegido pela mesma autenticação;
    - se há python3, pip e cron disponíveis, e sob qual usuário o site roda;
    - se o servidor tem saída para a internet (precisa alcançar googleapis.com);
    - qual o fuso horário configurado no servidor (`timedatectl` ou `date`).

(2) CREDENCIAL DO GOOGLE. Instale as dependências e teste o acesso à planilha:
        pip install google-api-python-client google-auth openpyxl
        python3 painel-dea/app/drive_download.py --verificar \
            --credencial /caminho/credencial.json
    Esse comando imprime o e-mail da conta de serviço. A planilha precisa estar
    compartilhada com esse e-mail como Leitor. Não siga adiante enquanto ele não
    responder "ACESSO OK" — todo o resto depende disto.

(3) ROTA E AUTENTICAÇÃO. Faça "Exercícios Anteriores" servir o painel.html.
    O painel é uma página estática autocontida: HTML + CSS + JS num arquivo só,
    que carrega um único arquivo irmão, dados.js, por <script src="dados.js">.

    EXIGÊNCIA DE SEGURANÇA, a mais importante desta migração:
    o dados.js TEM de estar atrás exatamente da mesma autenticação da página.
    Ele contém nome, Prec-cp e valor de 3.421 pessoas. Se a página pedir login
    mas o dados.js for servido de um caminho público, a base inteira fica
    acessível a quem souber a URL — e isso não aparece em nenhum teste visual.
    Desligue também listagem de diretório nesse caminho.

    Prefira servir o painel dentro de um <iframe> apontando para uma rota
    protegida, em vez de embutir o HTML na página do site. O painel usa nomes de
    classe curtos e genéricos (.aba, .nota, .chip, .selo, .grupo, .btn) e vai
    colidir com o CSS do site se for embutido. O iframe também mantém o arquivo
    idêntico ao do pacote, o que facilita atualizações futuras.

    Para testar a rota e a autenticação antes de o pipeline existir, use o
    dados.js que veio no pacote. O painel funciona só com esses dois arquivos.

(4) PIPELINE E AGENDAMENTO.
    - Copie app/ e estado/ para um diretório fora da raiz web (sugestão: /opt/dea).
      Os arquivos de estado NÃO podem ficar em caminho servido pela web.
    - Ajuste no topo de atualizar.py os caminhos BASE e DIR_WEB, ou defina as
      variáveis de ambiente DEA_BASE, DEA_WEB e DEA_GOOGLE_CREDENCIAL.
    - Rode uma vez à mão e me mostre a saída completa:
          python3 /opt/dea/app/atualizar.py
    - Compare com a referência e me mostre o resultado:
          python3 painel-dea/testes/comparar_saidas.py \
              painel-dea/app/dados.js /caminho/web/dados.js
      Observação: se a planilha tiver mudado desde 19/09, vai haver diferenças
      legítimas. Para um teste limpo, rode o build_data.py com --data-ref
      2026-09-19 sobre a mesma planilha.
    - Só depois disso agende no cron, às 09:00 em dias úteis, no horário local.
      Confira o fuso do servidor: o pipeline carimba em horário de Brasília, e o
      cron precisa disparar no mesmo horário real.

NÃO FAÇA, sem me perguntar antes:
    - alterar qualquer classificação, limite ou regra de agrupamento;
    - "melhorar" o painel, trocar cores, fontes ou layout;
    - recriar o painel na stack do site;
    - versionar a credencial do Google ou os arquivos de estado num repositório;
    - apagar ou sobrescrever estado/snapshot-anterior.json e estado/historico.json.

Ao final, me entregue: a URL protegida do painel, o caminho onde o pipeline
ficou, a linha do cron e o resultado do comparar_saidas.py.
```

---

## 3. Ordem de execução

A ordem importa: o passo 2 é o que pode inviabilizar tudo, então vem cedo.

| # | Passo | Como saber que deu certo |
|---|---|---|
| 1 | Reconhecimento do servidor | você sabe onde fica a autenticação e se há cron |
| 2 | Conta de serviço do Google | `drive_download.py --verificar` diz **ACESSO OK** |
| 3 | Rota protegida servindo o painel | abre logado, **e o `dados.js` dá 401/403 em aba anônima** |
| 4 | Pipeline rodando à mão | `atualizar.py` termina sem erro e publica |
| 5 | Teste de aceitação | `comparar_saidas.py` diz **IDÊNTICOS** |
| 6 | Cron às 09:00 em dias úteis | roda sozinho no dia seguinte |
| 7 | Desligar a tarefa agendada da Claude | ver §6 |

---

## 4. O que não pode ser alterado

`build_data.py` e `painel.html` vão como estão. Todo o ajuste ao servidor cabe em
`drive_download.py` e `atualizar.py`, que são arquivos novos e não tocam em regra
nenhuma.

Se algum dia o `build_data.py` precisar mudar de verdade, o procedimento é: ler o
`NOTAS-DOMINIO.md`, alterar, rodar `comparar_saidas.py` contra a saída anterior e
**entender cada divergência** antes de aceitar.

---

## 5. Os arquivos de estado

`snapshot-anterior.json` e `historico.json` são o que faz o painel ter memória:

- o **snapshot** é o retrato do dia anterior — sem ele a aba "Alterações do dia"
  não tem com o que comparar, e o contador de "dias na fila" da homologação zera,
  voltando a "Primeira leitura desta fila";
- o **histórico** acumula o que mudou a cada execução desde 16/09/2026 e **não tem
  como ser reconstruído**.

Três consequências práticas:

1. **Copie os dois junto com o resto.** Sem eles o painel nasce sem memória.
2. **Nunca deixe dois pipelines rodando.** Se a tarefa da Claude continuar ativa
   junto com o cron do servidor, cada uma compara com o próprio retrato: o
   histórico bifurca e as duas telas divergem sem avisar.
3. **Faça backup deles.** São pequenos (~125 KB juntos) e insubstituíveis.
   Um `cp` diário para outra pasta já resolve.

---

## 6. O dia da virada

Faça os passos 1 a 5 com calma, em qualquer dia. A virada em si é curta:

1. Rode a atualização do dia na Claude normalmente, como sempre.
2. Copie `snapshot-anterior.json` e `historico.json` **recém-gravados** para o
   servidor, substituindo os do pacote — assim o servidor continua exatamente de
   onde a Claude parou.
3. Rode `atualizar.py` no servidor e confira o painel.
4. **Desligue a tarefa agendada da Claude** (`trig_01Az1jw4RwQWx4mgb9WA2huz`).
5. Deixe o artifact congelado alguns dias como plano B.
6. Quando estiver confiante, exclua o artifact — é um painel com dados pessoais
   num link acessível a quem o tiver.

---

## 7. Quando der errado

| Sintoma | Causa provável |
|---|---|
| `drive_download` devolve **404** | a planilha não foi compartilhada com a conta de serviço |
| `drive_download` devolve **403** | a Google Drive API não está ativada no projeto |
| Painel abre em branco com aviso vermelho no topo | o `dados.js` não carregou — confira o caminho e se a autenticação não está bloqueando o próprio arquivo para a sessão logada |
| Painel abre com fontes diferentes | sem saída para o Google Fonts; ver §8 do `IDENTIDADE-VISUAL.md` |
| "Alterações do dia" mostra tudo como novo | o `snapshot-anterior.json` não foi copiado |
| Fila volta a "Primeira leitura" | idem |
| Horário do cabeçalho errado | fuso do servidor; o pipeline usa `America/Sao_Paulo` |
| `AVISO: Situações não previstas no mapa` na saída | surgiu texto novo na planilha. Leia o texto **integral na planilha** (o aviso trunca em 60 caracteres) e siga a seção correspondente do `NOTAS-DOMINIO.md` |

---

## 8. Um ganho possível depois

No servidor, com a conta de serviço, o **botão "atualizar agora" volta a ser
viável**. Ele existiu no painel e foi removido porque uma página publicada não tem
credencial para a planilha privada — só recarregava a tela sem trazer dado novo.
Lá, uma rota autenticada pode disparar o `atualizar.py` sob demanda. Deixe para
depois que o básico estiver rodando.
