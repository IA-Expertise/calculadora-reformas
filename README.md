# Calculadoras da Reforma Tributária

Portal único da IA Expertise para testar as três peças oficiais da Receita Federal (LC 214/2025):

1. Calculadora do regime regular — CBS, IBS e Imposto Seletivo
2. Calculadora do Simples Nacional — CBS e IBS
3. Gerador de DANFSe — XML da NFS-e para PDF

O navegador fala só com este portal. O Express encaminha cada chamada para a API certa, então não há CORS e a página não recebe o endereço interno dos serviços.

Este repositório não recalcula tributo e não embute as calculadoras. Elas continuam sendo os projetos oficiais:

- [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) (Java, porta local usual 8080)
- [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) (Java, porta local usual 8082)
- [calculadora-rtc-gerador-danfse](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) (Go, neste portal a porta local prevista é 8081)

## Rodar na máquina

Requisitos: Node.js 20 ou superior.

```bash
npm install
copy .env.example .env
npm start
```

No PowerShell o `copy` também funciona. Em macOS ou Linux, use `cp .env.example .env`.

Abra [http://localhost:3000](http://localhost:3000).

Se as três APIs estiverem desligadas, a barra do topo mostra **Offline** e a página continua utilizável. Calcular nesse estado devolve uma mensagem clara, sem quebrar a tela.

A saúde do próprio portal, usada pelo Railway, é `GET /health` e `GET /health/live`. Ela não consulta as calculadoras.

## Variáveis no Railway

Crie um serviço a partir deste repositório (o Dockerfile já escuta `PORT`, com padrão 3000). Em **Variables**, defina as origens das três APIs — esquema, host e porta, sem caminho no final:

| Variável | Exemplo local | O que é |
| --- | --- | --- |
| `API_REGIME_REGULAR_URL` | `http://localhost:8080` | Calculadora do regime regular |
| `API_SIMPLES_NACIONAL_URL` | `http://localhost:8082` | Calculadora do Simples Nacional |
| `API_DANFSE_URL` | `http://localhost:8081` | Gerador de DANFSe |

No Railway, troque `localhost` pelo endereço interno de cada serviço. Não é preciso publicar essas URLs: o site só chama `/proxy/regime-regular`, `/proxy/simples` e `/proxy/danfse`.

O domínio `iaexpertise.com.br` fica para um passo seguinte. Este serviço já pode ser o subdomínio.

Health check sugerido: `/health/live`.

## O que a tela faz

- **Regime regular.** Monta o JSON e envia `POST /api/calculadora/observabilidade/regime-geral`. O resumo lê CBS, IBS estadual, IBS municipal, Imposto Seletivo e o total. O JSON completo pode ser copiado. Gerar XML chama `POST /api/calculadora/xml/generate?tipo=nfe` (ou outro tipo). Validar chama `POST /api/calculadora/xml/validate?tipo=...&subtipo=grupo|nota`.
- **Simples Nacional.** Busca atividades com `GET /api/calculadora/simples-nacional/atividades?data=AAAA-MM-DD` e calcula com `POST /api/calculadora/observabilidade/simples-nacional`.
- **DANFSe.** Envia o XML com `POST /api/danfse?stc=0|1|2&canhoto=true|false` e `Content-Type: application/xml`. `stc`: 0 válida, 1 substituída, 2 cancelada. O PDF abre na página e baixa como `danfse.pdf`.

A barra de status tenta, nesta ordem, `/health/live`, `/versao`, `/api/health/live` e `/api/versao`. O gerador em Go responde em `/health/live`. As calculadoras Java publicam a versão em `/api/versao`.

## Contrato usado — e o que ficou assumido

Os corpos de exemplo seguem a documentação pública consultada em novembro de 2026.

### Regime regular

Fonte: `docs/exemplos.md` do repositório `ReceitaFederal/calculadora-rtc-regime-regular`.

O botão **Preencher exemplo prático** usa o item 3 daquele documento (serviço de educação, redução de 60%):

- município `4314902`, UF `RS`
- NBS `122011200`, CST `200`, cClassTrib `200028`
- base `1200.00`
- fato gerador `2027-03-10T10:00:00-03:00`
- alíquotas nominais: CBS `8.8`, IBS estadual `0.05`, IBS municipal `0.05` (pontos percentuais, como no exemplo oficial — `0.05` é 0,05%, não 5%)

Regras da própria Receita que o portal respeita:

- O campo vigente é `dhFatoGerador`. `dataHoraEmissao` está obsoleto.
- De 2027 em diante, `aliquotasNominais` é obrigatório. Antes disso, a API rejeita o bloco. O portal só envia as alíquotas quando o ano do fato gerador é 2027 ou posterior.
- A resposta HTTP pode ser 200 mesmo com item inconsistente. O que importa é `estadoItem`: `CALCULADO`, `CALCULO_SIMULADO`, `INCONSISTENCIA_ENTRADA`, `NAO_IMPLEMENTADO` ou `FALHA_TECNICA`.
- Os erros `REG-*` vêm em `erros[]` com `code`, `title`, `pointer` e `detail`. A tela mostra esses quatro campos. O único texto extra fixo no portal é o do exemplo oficial `REG-011` (NCM não vinculada à classificação), quando a API manda só o código.
- Os cartões somam `gCBS.vCBS`, `gIBSUF.vIBSUF`, `gIBSMun.vIBSMun` e `IS.vIS`. Se o total oficial (`IBSCBSTot` / `ISTot`) vier preenchido, ele prevalece para CBS, IS e, quando não houver divisão estadual/municipal, para o IBS.

**Geração de XML.** O manual oficial diz que `POST /xml/generate` espera a resposta de `POST /regime-geral` (o objeto ROC), não o envelope da observabilidade. Este portal envia o JSON que a observabilidade devolveu (`objetos` + `total`), porque é o cálculo que a tela acabou de fazer. Se a versão da API recusar esse formato, a mensagem aparece na aba de XML sem alterar o resumo.

### Simples Nacional

Fonte: records Java `OperacaoSimplesInput` e `ItemSimplesInput`, mais o catálogo `CodigoValidacaoSimples` (`VSN-*`), no repositório `ReceitaFederal/calculadora-rtc-simples-nacional`.

O `docs/exemplos.md` desse repositório, na data da consulta, repetia o exemplo do regime regular (inclusive o caminho `/observabilidade/regime-geral`). Por isso o exemplo do botão saiu do contrato OpenAPI dos records, não daquele markdown:

```json
{
  "id": "507f1f77bcf86cd799439011",
  "versao": "2.0.0",
  "data": "2027-03-15",
  "tpDoc": "55",
  "CRT": "1",
  "itens": [
    {
      "numero": 1,
      "cAtivSN": "01",
      "cClassTrib": "000001",
      "baseCalculo": "950.00",
      "valorImpostoSeletivo": "0.00",
      "pIBSSN": "1.25",
      "pCBSSN": "2.75"
    }
  ]
}
```

Base, IS e alíquotas vão como texto, do jeito que a API valida os códigos `VSN-*`. Campos opcionais vazios (`tpRegimeIBSCBS`, `tpEnteGov`, alíquota em branco) não são enviados.

A lista de atividades devolve `codigo`, `descricao`, `rotuloAnexo`, `disponivel` e os demais campos de `AtividadeSimplesDomain`. A busca filtra no navegador. O resumo lê `total.vCBSSNtot`, `vIBSSNtot`, `totalIs`, `vRBSNtot` e `totalTributos`.

### DANFSe

Fonte: README de `ReceitaFederal/calculadora-rtc-gerador-danfse`.

Não há XML de NFS-e de exemplo nesse README. O portal não inventa uma nota: use o XML real (ou de homologação) da NFS-e. Situação (`stc`) e canhoto são parâmetros da requisição, não tags do XML. O canhoto começa marcado porque o padrão do serviço é `true`.

## Proxy

| Caminho no portal | Variável |
| --- | --- |
| `/proxy/regime-regular/*` | `API_REGIME_REGULAR_URL` |
| `/proxy/simples/*` | `API_SIMPLES_NACIONAL_URL` |
| `/proxy/danfse/*` | `API_DANFSE_URL` |

O proxy repassa método, `Content-Type`, `Accept`, query string e corpo (JSON ou XML, até 8 MB). O tempo limite é 45 segundos nas calculadoras e 60 segundos no DANFSe. Erro de upstream vira `{ "erro", "detalhe" }` com o status da API quando ele existe. Falha de conexão vira 502; tempo esgotado vira 504. A resposta de sucesso (JSON, XML ou PDF) passa intacta, inclusive o cabeçalho `x-warning-dados-simulados`.
