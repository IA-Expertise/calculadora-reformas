"use strict";

/**
 * Interface do portal. Todas as chamadas passam pelo proxy deste mesmo servidor.
 * Nenhum endereço interno de API aparece aqui.
 */

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

/** Textos oficiais do catálogo VSN da calculadora do Simples Nacional (NT 2026.005). */
const GLOSSARIO_VSN = {
  "VSN-000": ["Erro de validação não categorizado", "O tipo de validação aplicado não possui uma categoria específica."],
  "VSN-001": ["Base de cálculo ausente", "A base de cálculo do Simples Nacional é obrigatória e não foi informada."],
  "VSN-002": ["Base de cálculo inválida", "A base informada não é um decimal válido ou é negativa."],
  "VSN-003": ["Imposto Seletivo inválido", "O valor do Imposto Seletivo não é um decimal válido ou é negativo."],
  "VSN-004": ["Alíquota pCBSSN ausente", "A alíquota efetiva de CBS do Simples é exigida neste item e não foi informada."],
  "VSN-005": ["Alíquota pCBSSN inválida", "A alíquota efetiva de CBS informada não é um decimal válido ou é negativa."],
  "VSN-006": ["Alíquota pIBSSN ausente", "A alíquota efetiva de IBS do Simples é exigida neste item e não foi informada."],
  "VSN-007": ["Alíquota pIBSSN inválida", "A alíquota efetiva de IBS informada não é um decimal válido ou é negativa."],
  "VSN-010": ["Número do item ausente", "O número do item é obrigatório."],
  "VSN-011": ["Lista de itens vazia", "A operação precisa ter ao menos um item."],
  "VSN-012": ["Data do fato gerador inválida", "Informe a data no formato AAAA-MM-DD."],
  "VSN-013": ["Dado global ausente", "O identificador ou a versão da operação não foi informado."],
  "VSN-014": ["Tipo de documento ausente", "O tipo de documento fiscal (tpDoc) é obrigatório."],
  "VSN-015": ["Documento não suportado", "Esse tpDoc não está habilitado para o cálculo do Simples na data informada."],
  "VSN-016": ["CRT inválido", "O Código de Regime Tributário deve ser 1, 2, 3 ou 4."],
  "VSN-017": ["tpRegimeIBSCBS inválido", "Quando informado, o regime de apuração do IBS/CBS deve ser 1 ou 2."],
  "VSN-018": ["Regime incompatível com o CRT", "A combinação de CRT e tpRegimeIBSCBS não é aceita pela NT 2026.005."],
  "VSN-019": ["Operação fora do escopo", "MEI, regime regular do IBS/CBS ou regime normal sem apuração por fora não são calculados neste módulo."],
  "VSN-020": ["cClassTrib ausente", "A classificação tributária do IBS/CBS é obrigatória."],
  "VSN-021": ["cClassTrib desconhecido", "A classificação não existe ou não vigora na data do fato gerador."],
  "VSN-022": ["cClassTrib incompatível com o documento", "Essa classificação não pode ser usada neste tipo de documento."],
  "VSN-023": ["Atividade incompatível com a classificação", "A atividade 90 (não tributável) não combina com cClassTrib de receita bruta 1 a 5."],
  "VSN-024": ["Ente governamental inválido", "tpEnteGov, quando informado, deve ser 1 (União), 2 (Estado), 3 (DF) ou 4 (Município)."],
  "VSN-025": ["Compra governamental sem vigência", "Não há parâmetro de transição de alíquota para compra governamental nesta data."],
  "VSN-026": ["Parametrização indisponível", "Falta, nesta data, uma tabela de cálculo do Simples. A calculadora não assume regra implícita."],
  "VSN-027": ["Tratamento ainda não implementado", "A classificação está marcada como não implementada. O item fica de fora dos totais."],
  "VSN-999": ["Falha técnica", "A calculadora encontrou uma falha inesperada neste item."]
};

/** Único texto REG fixo no portal: o exemplo oficial REG-011. Os demais vêm da API. */
const GLOSSARIO_REG = {
  "REG-011": ["NCM não vinculada", "A NCM informada não está vinculada a esta classificação tributária (cClassTrib). Confira o par na tabela da calculadora."]
};

const ESTADOS = {
  CALCULADO: "Calculado",
  CALCULO_SIMULADO: "Cálculo simulado, com alíquotas informadas",
  INCONSISTENCIA_ENTRADA: "Dados de entrada inconsistentes",
  NAO_IMPLEMENTADO: "Tratamento ainda não implementado",
  NAO_CALCULADO: "Item não calculado",
  FALHA_TECNICA: "Falha técnica no item"
};

const memoria = {
  regime: null,
  simples: null,
  xml: "",
  pdf: ""
};

let atividadesCache = { data: "", lista: [] };

document.addEventListener("DOMContentLoaded", () => {
  montarUfs();
  ligarAbas();
  ligarSubabas(document.getElementById("resultado-regular"));
  ligarSubabas(document.querySelector("#painel-simples .cartao:last-child"));
  document.getElementById("form-regular").addEventListener("submit", calcularRegime);
  document.getElementById("btn-reg-exemplo").addEventListener("click", preencherExemploRegime);
  document.getElementById("btn-reg-limpar").addEventListener("click", limparRegime);
  document.getElementById("btn-reg-copiar").addEventListener("click", () => copiarJson(memoria.regime, "btn-reg-copiar"));
  document.getElementById("btn-xml-gerar").addEventListener("click", gerarXml);
  document.getElementById("btn-xml-validar").addEventListener("click", validarXml);
  document.getElementById("btn-xml-copiar").addEventListener("click", copiarXml);

  document.getElementById("form-simples").addEventListener("submit", calcularSimples);
  document.getElementById("btn-sn-exemplo").addEventListener("click", preencherExemploSimples);
  document.getElementById("btn-sn-limpar").addEventListener("click", limparSimples);
  document.getElementById("btn-sn-copiar").addEventListener("click", () => copiarJson(memoria.simples, "btn-sn-copiar"));
  ligarBuscaAtividade();

  document.getElementById("form-danfse").addEventListener("submit", gerarDanfse);
  document.getElementById("btn-danfse-limpar").addEventListener("click", limparDanfse);
  ligarArquivoXml();

  sondarTudo();
  setInterval(sondarTudo, 30000);
  iniciarVitrine();
});

const BANNER_SLIDES = [
  {
    tag: "Compliance B2B",
    titulo: "CNPJ Alerta & CPF Alerta",
    descricao: "Auditoria instantânea de certidões e histórico jurídico de clientes e fornecedores.",
    link: "https://cnpjalerta.com.br",
    cta: "Consultar Agora →",
    corBadge: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    imagem: "/banners/banner-cnpj-alerta.jpg"
  },
  {
    tag: "Legal Tech",
    titulo: "LexMax — Gestão Jurídica com IA",
    descricao: "Acompanhamento processual inteligente integrado ao eProc e Datajud para escritórios.",
    link: "https://lexmax.com.br",
    cta: "Conhecer LexMax →",
    corBadge: "bg-sky-500/20 text-sky-300 border-sky-400/30",
    imagem: "/banners/banner-lexmax.jpg"
  },
  {
    tag: "Marketing IA",
    titulo: "PostMais — Automação no WhatsApp",
    descricao: "Crie e publique campanhas profissionais para sua empresa direto pelo WhatsApp.",
    link: "https://postmais.com.br",
    cta: "Acessar PostMais →",
    corBadge: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    imagem: "/banners/banner-postmais.jpg"
  },
  {
    tag: "Desenvolvimento Sob Medida",
    titulo: "Criação de Aplicativos e Sistemas",
    descricao: "Soluções digitais completas, integrações de APIs e plataformas para empresas privadas e órgãos públicos.",
    link: "https://iaexpertise.com.br",
    cta: "Solicitar Orçamento →",
    corBadge: "bg-purple-500/20 text-purple-300 border-purple-400/30",
    imagem: "/banners/banner-sob-medida.jpg"
  },
  {
    tag: "Inteligência Artificial",
    titulo: "IAExpertise — Agentes e Automação Corporativa",
    descricao: "Implementação de assistentes de IA, atendimento automatizado e inteligência de dados para negócios.",
    link: "https://iaexpertise.com.br",
    cta: "Ver Soluções →",
    corBadge: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
    imagem: "/banners/banner-agentes.jpg"
  }
];

function iniciarVitrine() {
  const raiz = document.getElementById("vitrine");
  const slide = document.getElementById("vitrine-slide");
  const pontos = document.getElementById("vitrine-pontos");
  if (!raiz || !slide || !pontos || !BANNER_SLIDES.length) return;

  let indice = 0;
  let timer = 0;
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mostrar(proximo) {
    indice = (proximo + BANNER_SLIDES.length) % BANNER_SLIDES.length;
    const item = BANNER_SLIDES[indice];
    slide.style.backgroundImage = `url("${escapar(item.imagem)}")`;
    slide.innerHTML = `
      <div class="vitrine-conteudo">
        <span class="vitrine-badge ${item.corBadge}">${escapar(item.tag)}</span>
        <strong>${escapar(item.titulo)}</strong>
        <p>${escapar(item.descricao)}</p>
        <a class="vitrine-cta" href="${escapar(item.link)}" target="_blank" rel="noopener noreferrer">${escapar(item.cta)}</a>
      </div>
    `;
    pontos.querySelectorAll("button").forEach((botao, posicao) => {
      const ativo = posicao === indice;
      botao.setAttribute("aria-current", ativo ? "true" : "false");
      botao.tabIndex = ativo ? 0 : -1;
    });
  }

  BANNER_SLIDES.forEach((item, posicao) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.setAttribute("aria-label", item.titulo);
    botao.addEventListener("click", () => {
      mostrar(posicao);
      reiniciar();
    });
    pontos.appendChild(botao);
  });

  document.getElementById("vitrine-anterior").addEventListener("click", () => {
    mostrar(indice - 1);
    reiniciar();
  });
  document.getElementById("vitrine-proximo").addEventListener("click", () => {
    mostrar(indice + 1);
    reiniciar();
  });

  function parar() {
    clearInterval(timer);
    timer = 0;
  }

  function reiniciar() {
    parar();
    if (reduzido) return;
    timer = setInterval(() => mostrar(indice + 1), 6500);
  }

  raiz.addEventListener("mouseenter", parar);
  raiz.addEventListener("mouseleave", reiniciar);
  raiz.addEventListener("focusin", parar);
  raiz.addEventListener("focusout", (evento) => {
    if (!raiz.contains(evento.relatedTarget)) reiniciar();
  });

  mostrar(0);
  reiniciar();
}

function montarUfs() {
  const select = document.getElementById("reg-uf");
  select.innerHTML = UFS.map((uf) => `<option value="${uf}">${uf}</option>`).join("");
  select.value = "RS";
}

function ligarAbas() {
  document.querySelectorAll("[data-aba]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const nome = botao.dataset.aba;
      document.querySelectorAll("[data-aba]").forEach((outro) => {
        const ativo = outro.dataset.aba === nome;
        outro.setAttribute("aria-selected", ativo ? "true" : "false");
      });
      ["regular", "simples", "danfse"].forEach((id) => {
        document.getElementById(`painel-${id}`).hidden = id !== nome;
      });
    });
  });
}

function ligarSubabas(raiz) {
  if (!raiz) return;
  raiz.querySelectorAll(".subaba").forEach((botao) => {
    botao.addEventListener("click", () => {
      raiz.querySelectorAll(".subaba").forEach((outro) => {
        outro.setAttribute("aria-selected", outro === botao ? "true" : "false");
      });
      raiz.querySelectorAll("[data-painel-sub]").forEach((painel) => {
        painel.hidden = painel.dataset.painelSub !== botao.dataset.sub;
      });
    });
  });
}

function anoDaData(texto) {
  const ano = Number(String(texto || "").slice(0, 4));
  return Number.isInteger(ano) ? ano : 0;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function moeda(valor) {
  const n = numero(valor);
  if (n === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function percentual(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  return `${String(valor).replace(".", ",")}%`;
}

function ocupar(botao, ligado) {
  botao.disabled = ligado;
  botao.setAttribute("aria-busy", ligado ? "true" : "false");
  const spinner = botao.querySelector(".spinner");
  if (spinner) spinner.hidden = !ligado;
}

async function lerCorpo(resposta) {
  const tipo = resposta.headers.get("content-type") || "";
  if (tipo.includes("application/pdf") || tipo.includes("octet-stream")) {
    return { binario: await resposta.arrayBuffer(), tipo, status: resposta.status, ok: resposta.ok };
  }
  const texto = await resposta.text();
  let json = null;
  if (texto && (tipo.includes("json") || texto.trim().startsWith("{") || texto.trim().startsWith("["))) {
    try { json = JSON.parse(texto); } catch { json = null; }
  }
  return {
    texto,
    json,
    tipo,
    status: resposta.status,
    ok: resposta.ok,
    aviso: resposta.headers.get("x-warning-dados-simulados")
  };
}

function detalheEstruturado(corpo) {
  if (!corpo) return null;
  if (corpo.json && typeof corpo.json === "object") {
    const detalhe = corpo.json.detalhe;
    if (typeof detalhe === "string") {
      try { return JSON.parse(detalhe); } catch { return corpo.json; }
    }
    return corpo.json;
  }
  if (typeof corpo.texto === "string") {
    try { return JSON.parse(corpo.texto); } catch { return null; }
  }
  return null;
}

function coletarErros(no, prefixo, acc) {
  const lista = acc || [];
  if (!no || typeof no !== "object") return lista;
  if (Array.isArray(no)) {
    no.forEach((item) => coletarErros(item, prefixo, lista));
    return lista;
  }
  const code = no.code || no.codigo;
  if (typeof code === "string" && code.startsWith(prefixo)) lista.push(no);
  Object.values(no).forEach((valor) => {
    if (valor && typeof valor === "object") coletarErros(valor, prefixo, lista);
  });
  return lista;
}

function descreverErro(item, glossario) {
  const code = item.code || item.codigo || "";
  const conhecido = glossario[code];
  const titulo = item.title || item.titulo || (conhecido ? conhecido[0] : "");
  const detalhe = item.detail || item.detalhe || item.descricao || item.mensagem || (conhecido ? conhecido[1] : "");
  const pointer = item.pointer || "";
  return { code, titulo, detalhe, pointer };
}

function htmlErros(erros, glossario) {
  const vistos = new Set();
  const itens = [];
  erros.forEach((bruto) => {
    const erro = descreverErro(bruto, glossario);
    const chave = `${erro.code}|${erro.detalhe}|${erro.pointer}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    const onde = erro.pointer ? ` Campo: ${erro.pointer}.` : "";
    itens.push(`<li><strong>${escapar(erro.code)}${erro.titulo ? ` — ${escapar(erro.titulo)}` : ""}</strong> ${escapar(erro.detalhe || "A calculadora recusou este dado.")}${escapar(onde)}</li>`);
  });
  return itens.join("");
}

function escapar(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mostrarAlertas(id, blocos) {
  const destino = document.getElementById(id);
  destino.innerHTML = blocos.filter(Boolean).map((bloco) => {
    return `<div class="alerta ${bloco.tipo}" role="${bloco.tipo === "erro" ? "alert" : "status"}"><strong>${escapar(bloco.titulo)}</strong>${bloco.html || escapar(bloco.texto || "")}</div>`;
  }).join("");
}

function mensagemFalha(corpo) {
  if (corpo && corpo.json && corpo.json.erro) {
    const extra = corpo.json.detalhe && typeof corpo.json.detalhe === "string" && !corpo.json.detalhe.trim().startsWith("{")
      ? ` ${corpo.json.detalhe}`
      : "";
    return `${corpo.json.erro}${extra}`.trim();
  }
  if (corpo && corpo.texto) return corpo.texto.slice(0, 500);
  return "Não foi possível concluir a chamada.";
}

async function sondar(prefixo) {
  const caminhos = [
    "/health/live",
    "/versao",
    "/api/health/live",
    "/api/versao",
    "/api/calculadora/dados-abertos/versao"
  ];
  for (const caminho of caminhos) {
    let resposta;
    try {
      resposta = await fetch(prefixo + caminho, { cache: "no-store", signal: AbortSignal.timeout(3500) });
    } catch {
      return false;
    }
    if (resposta.ok) return true;
    if (resposta.status === 502 || resposta.status === 503 || resposta.status === 504) return false;
  }
  return false;
}

async function sondarTudo() {
  const pares = [
    ["status-regular", "/proxy/regime-regular", "Regime Regular"],
    ["status-simples", "/proxy/simples", "Simples"],
    ["status-danfse", "/proxy/danfse", "DANFSe"]
  ];
  await Promise.all(pares.map(async ([id, prefixo, nome]) => {
    const el = document.getElementById(id);
    const online = await sondar(prefixo);
    el.classList.remove("verificando", "online", "offline");
    el.classList.add(online ? "online" : "offline");
    el.querySelector(".nome").textContent = `${nome} · ${online ? "Online" : "Offline"}`;
  }));
}

function preencherExemploRegime() {
  document.getElementById("reg-uf").value = "RS";
  document.getElementById("reg-municipio").value = "4314902";
  document.getElementById("reg-tipo").value = "nbs";
  document.getElementById("reg-codigo").value = "122011200";
  document.getElementById("reg-cst").value = "200";
  document.getElementById("reg-classtrib").value = "200028";
  document.getElementById("reg-data").value = "2027-03-10T10:00:00-03:00";
  document.getElementById("reg-base").value = "1200.00";
  document.getElementById("reg-qtd").value = "";
  document.getElementById("reg-unidade").value = "";
  document.getElementById("reg-cbs").value = "8.8";
  document.getElementById("reg-ibs-uf").value = "0.05";
  document.getElementById("reg-ibs-mun").value = "0.05";
}

function limparRegime() {
  document.getElementById("form-regular").reset();
  document.getElementById("reg-uf").value = "RS";
  memoria.regime = null;
  memoria.xml = "";
  document.getElementById("reg-alertas").innerHTML = "";
  document.getElementById("xml-alertas").innerHTML = "";
  document.getElementById("reg-cards").hidden = true;
  document.getElementById("reg-vazio").hidden = false;
  document.getElementById("reg-tabela").innerHTML = "";
  document.getElementById("reg-memoria").hidden = true;
  document.getElementById("reg-json").textContent = "Nenhum cálculo ainda.";
  document.getElementById("xml-saida").textContent = "O XML gerado aparece aqui.";
}

function corpoRegime() {
  const data = document.getElementById("reg-data").value.trim();
  const tipo = document.getElementById("reg-tipo").value;
  const item = {
    numero: 1,
    cst: document.getElementById("reg-cst").value.trim(),
    cClassTrib: document.getElementById("reg-classtrib").value.trim(),
    baseCalculo: numero(document.getElementById("reg-base").value)
  };
  item[tipo] = document.getElementById("reg-codigo").value.trim();
  const qtd = numero(document.getElementById("reg-qtd").value);
  const unidade = document.getElementById("reg-unidade").value.trim();
  if (qtd !== null) item.quantidade = qtd;
  if (unidade) item.unidade = unidade;

  if (anoDaData(data) >= 2027) {
    item.aliquotasNominais = {
      cbs: numero(document.getElementById("reg-cbs").value),
      ibsEstadual: numero(document.getElementById("reg-ibs-uf").value),
      ibsMunicipal: numero(document.getElementById("reg-ibs-mun").value)
    };
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Date.now()),
    versao: "1.0.0",
    dhFatoGerador: data,
    municipio: Number(document.getElementById("reg-municipio").value.trim()),
    uf: document.getElementById("reg-uf").value,
    itens: [item]
  };
}

function validarRegime(corpo) {
  if (!/^\d{7}$/.test(String(corpo.municipio || ""))) return "Informe o município com 7 dígitos do IBGE.";
  if (!corpo.dhFatoGerador) return "Informe a data e hora do fato gerador, com o fuso. Exemplo: 2027-03-10T10:00:00-03:00.";
  const item = corpo.itens[0];
  if (!item.ncm && !item.nbs) return "Informe a NCM ou a NBS.";
  if (item.baseCalculo === null || item.baseCalculo < 0) return "Informe o valor da operação com um número zero ou positivo.";
  if (anoDaData(corpo.dhFatoGerador) >= 2027) {
    const a = item.aliquotasNominais;
    if ([a.cbs, a.ibsEstadual, a.ibsMunicipal].some((n) => n === null || n < 0)) {
      return "Em 2027 em diante a calculadora exige as três alíquotas nominais (CBS, IBS estadual e IBS municipal).";
    }
  }
  return "";
}

async function calcularRegime(evento) {
  evento.preventDefault();
  const botao = document.getElementById("btn-reg-calcular");
  const corpo = corpoRegime();
  const erroLocal = validarRegime(corpo);
  if (erroLocal) {
    mostrarAlertas("reg-alertas", [{ tipo: "erro", titulo: "Confira o formulário", texto: erroLocal }]);
    return;
  }
  ocupar(botao, true);
  mostrarAlertas("reg-alertas", []);
  try {
    const resposta = await fetch("/proxy/regime-regular/api/calculadora/observabilidade/regime-geral", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo)
    });
    const lido = await lerCorpo(resposta);
    if (!lido.ok) {
      const estruturado = detalheEstruturado(lido);
      const erros = coletarErros(estruturado, "REG-");
      mostrarAlertas("reg-alertas", [{
        tipo: "erro",
        titulo: "A calculadora não concluiu o cálculo",
        texto: erros.length ? "" : mensagemFalha(lido),
        html: erros.length ? `<ul>${htmlErros(erros, GLOSSARIO_REG)}</ul>` : ""
      }]);
      return;
    }
    memoria.regime = lido.json || {};
    pintarRegime(memoria.regime, lido.aviso);
  } catch {
    mostrarAlertas("reg-alertas", [{ tipo: "erro", titulo: "Sem resposta", texto: "O portal não conseguiu falar com a calculadora do regime regular." }]);
  } finally {
    ocupar(botao, false);
  }
}

function somarCaminho(objetos, caminho) {
  return objetos.reduce((acc, objeto) => {
    const valor = caminho.split(".").reduce((no, chave) => (no == null ? undefined : no[chave]), objeto);
    const n = numero(valor);
    return n === null ? acc : acc + n;
  }, 0);
}

function primeiroTexto(objetos, caminho) {
  for (const objeto of objetos) {
    const valor = caminho.split(".").reduce((no, chave) => (no == null ? undefined : no[chave]), objeto);
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return "";
}

function pintarRegime(dados, aviso) {
  const objetos = Array.isArray(dados.objetos) ? dados.objetos : [];
  const total = dados.total && dados.total.tribCalc ? dados.total.tribCalc : {};
  const cbs = numero(total.IBSCBSTot && total.IBSCBSTot.gCBS && total.IBSCBSTot.gCBS.vCBS);
  const ibsTotal = numero(total.IBSCBSTot && total.IBSCBSTot.gIBS && total.IBSCBSTot.gIBS.vIBS);
  const isTotal = numero(total.ISTot && total.ISTot.vIS);
  const cbsItens = somarCaminho(objetos, "tribCalc.IBSCBS.gIBSCBS.gCBS.vCBS");
  const uf = somarCaminho(objetos, "tribCalc.IBSCBS.gIBSCBS.gIBSUF.vIBSUF");
  const mun = somarCaminho(objetos, "tribCalc.IBSCBS.gIBSCBS.gIBSMun.vIBSMun");
  const isItens = objetos.reduce((acc, objeto) => {
    const imposto = objeto.tribCalc && objeto.tribCalc.IS;
    if (!imposto) return acc;
    const valor = numero(imposto.vIS != null ? imposto.vIS : imposto.valor);
    return valor === null ? acc : acc + valor;
  }, 0);
  const cbsFinal = cbs === null ? cbsItens : cbs;
  const isFinal = isTotal === null ? isItens : isTotal;
  const ibsPartes = uf + mun;
  const ibsFinal = ibsPartes > 0 ? ibsPartes : (ibsTotal || 0);
  const totalFinal = cbsFinal + ibsFinal + isFinal;

  document.getElementById("reg-vazio").hidden = true;
  document.getElementById("reg-cards").hidden = false;
  document.getElementById("reg-valor-cbs").textContent = moeda(cbsFinal);
  document.getElementById("reg-valor-uf").textContent = moeda(uf);
  document.getElementById("reg-valor-mun").textContent = moeda(mun);
  document.getElementById("reg-valor-is").textContent = moeda(isFinal);
  document.getElementById("reg-valor-total").textContent = moeda(totalFinal);
  document.getElementById("reg-aliq-cbs").textContent = percentual(primeiroTexto(objetos, "tribCalc.IBSCBS.gIBSCBS.gCBS.pCBS"));
  document.getElementById("reg-aliq-uf").textContent = percentual(primeiroTexto(objetos, "tribCalc.IBSCBS.gIBSCBS.gIBSUF.pIBSUF"));
  document.getElementById("reg-aliq-mun").textContent = percentual(primeiroTexto(objetos, "tribCalc.IBSCBS.gIBSCBS.gIBSMun.pIBSMun"));
  document.getElementById("reg-json").textContent = JSON.stringify(dados, null, 2);

  const linhas = objetos.map((objeto) => {
    const g = objeto.tribCalc && objeto.tribCalc.IBSCBS && objeto.tribCalc.IBSCBS.gIBSCBS;
    const estado = ESTADOS[objeto.estadoItem] || objeto.estadoItem || "—";
    return `<tr>
      <td>${escapar(objeto.nObj ?? "—")}</td>
      <td>${escapar(estado)}</td>
      <td class="num">${g ? moeda(g.vBC) : "—"}</td>
      <td class="num">${g && g.gCBS ? moeda(g.gCBS.vCBS) : "—"}</td>
      <td class="num">${g && g.gIBSUF ? moeda(g.gIBSUF.vIBSUF) : "—"}</td>
      <td class="num">${g && g.gIBSMun ? moeda(g.gIBSMun.vIBSMun) : "—"}</td>
    </tr>`;
  }).join("");
  document.getElementById("reg-tabela").innerHTML = linhas
    ? `<table><thead><tr><th>Item</th><th>Situação</th><th class="num">Base</th><th class="num">CBS</th><th class="num">IBS UF</th><th class="num">IBS mun.</th></tr></thead><tbody>${linhas}</tbody></table>`
    : "";

  const memorias = [];
  coletarTextos(dados, "memoriaCalculo", memorias);
  const bloco = document.getElementById("reg-memoria");
  if (memorias.length) {
    bloco.hidden = false;
    bloco.textContent = memorias.join("\n\n");
  } else {
    bloco.hidden = true;
    bloco.textContent = "";
  }

  const erros = coletarErros(dados, "REG-");
  const blocos = [];
  if (aviso) blocos.push({ tipo: "aviso", titulo: "Cálculo simulado", texto: aviso });
  if (erros.length) {
    blocos.push({ tipo: "erro", titulo: "A calculadora apontou inconsistências", html: `<ul>${htmlErros(erros, GLOSSARIO_REG)}</ul>` });
  }
  mostrarAlertas("reg-alertas", blocos);
}

function coletarTextos(no, chave, acc) {
  if (!no || typeof no !== "object") return;
  if (typeof no[chave] === "string" && no[chave].trim()) acc.push(no[chave].trim());
  Object.values(no).forEach((valor) => {
    if (valor && typeof valor === "object") coletarTextos(valor, chave, acc);
  });
}

async function gerarXml() {
  const botao = document.getElementById("btn-xml-gerar");
  if (!memoria.regime) {
    mostrarAlertas("xml-alertas", [{ tipo: "erro", titulo: "Calcule antes de gerar", texto: "O XML sai do JSON devolvido pela calculadora." }]);
    return;
  }
  const tipo = document.getElementById("xml-tipo").value;
  ocupar(botao, true);
  mostrarAlertas("xml-alertas", []);
  try {
    const resposta = await fetch(`/proxy/regime-regular/api/calculadora/xml/generate?tipo=${encodeURIComponent(tipo)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/xml, application/json" },
      body: JSON.stringify(memoria.regime)
    });
    const lido = await lerCorpo(resposta);
    if (!lido.ok || lido.json) {
      const erros = coletarErros(detalheEstruturado(lido), "REG-");
      mostrarAlertas("xml-alertas", [{
        tipo: "erro",
        titulo: "A geração de XML não foi aceita",
        texto: erros.length ? "" : mensagemFalha(lido),
        html: erros.length ? `<ul>${htmlErros(erros, GLOSSARIO_REG)}</ul>` : ""
      }]);
      return;
    }
    memoria.xml = lido.texto || "";
    document.getElementById("xml-saida").textContent = memoria.xml || "(resposta vazia)";
    mostrarAlertas("xml-alertas", [{ tipo: "ok", titulo: "XML gerado", texto: "Revise o grupo e, se quiser, valide contra o XSD." }]);
  } catch {
    mostrarAlertas("xml-alertas", [{ tipo: "erro", titulo: "Sem resposta", texto: "O portal não conseguiu pedir a geração do XML." }]);
  } finally {
    ocupar(botao, false);
  }
}

async function validarXml() {
  const botao = document.getElementById("btn-xml-validar");
  const xml = (memoria.xml || document.getElementById("xml-saida").textContent || "").trim();
  if (!xml || xml.startsWith("O XML gerado")) {
    mostrarAlertas("xml-alertas", [{ tipo: "erro", titulo: "Não há XML", texto: "Gere o XML antes de validar." }]);
    return;
  }
  const tipo = document.getElementById("xml-tipo").value;
  const subtipo = document.getElementById("xml-subtipo").value;
  ocupar(botao, true);
  try {
    const resposta = await fetch(`/proxy/regime-regular/api/calculadora/xml/validate?tipo=${encodeURIComponent(tipo)}&subtipo=${encodeURIComponent(subtipo)}`, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/json, application/problem+json, text/plain" },
      body: xml
    });
    const lido = await lerCorpo(resposta);
    if (!lido.ok) {
      mostrarAlertas("xml-alertas", [{ tipo: "erro", titulo: "XML rejeitado na validação", texto: mensagemFalha(lido) }]);
      return;
    }
    const valido = lido.json === true || String(lido.texto).trim() === "true";
    mostrarAlertas("xml-alertas", [{
      tipo: valido ? "ok" : "erro",
      titulo: valido ? "XML válido" : "XML não validado",
      texto: valido ? "A calculadora aceitou o XML para o tipo e o subtipo escolhidos." : "A calculadora devolveu uma resposta diferente de verdadeiro."
    }]);
  } catch {
    mostrarAlertas("xml-alertas", [{ tipo: "erro", titulo: "Sem resposta", texto: "O portal não conseguiu pedir a validação do XML." }]);
  } finally {
    ocupar(botao, false);
  }
}

function copiarXml() {
  const texto = document.getElementById("xml-saida").textContent;
  copiarTexto(texto, "btn-xml-copiar", "Copiar XML");
}

function ligarBuscaAtividade() {
  const campo = document.getElementById("sn-busca");
  const lista = document.getElementById("sn-sugestoes");
  let sequencia = 0;
  campo.addEventListener("input", () => {
    const atual = ++sequencia;
    window.setTimeout(async () => {
      if (atual !== sequencia) return;
      await abrirSugestoes(campo.value);
    }, 250);
  });
  campo.addEventListener("focus", () => abrirSugestoes(campo.value));
  document.addEventListener("click", (evento) => {
    if (!campo.parentElement.contains(evento.target)) lista.hidden = true;
  });
  document.getElementById("sn-data").addEventListener("change", () => {
    atividadesCache = { data: "", lista: [] };
  });
}

async function carregarAtividades() {
  const data = document.getElementById("sn-data").value;
  if (!data) return [];
  if (atividadesCache.data === data) return atividadesCache.lista;
  const resposta = await fetch(`/proxy/simples/api/calculadora/simples-nacional/atividades?data=${encodeURIComponent(data)}`, {
    headers: { Accept: "application/json" }
  });
  const lido = await lerCorpo(resposta);
  if (!lido.ok || !Array.isArray(lido.json)) {
    throw new Error(mensagemFalha(lido));
  }
  atividadesCache = { data, lista: lido.json };
  return lido.json;
}

async function abrirSugestoes(texto) {
  const lista = document.getElementById("sn-sugestoes");
  let atividades;
  try {
    atividades = await carregarAtividades();
  } catch (erro) {
    lista.hidden = false;
    lista.innerHTML = `<p class="ajuda" style="padding:0.6rem">${escapar(erro.message || "Não foi possível listar as atividades.")}</p>`;
    return;
  }
  const q = texto.trim().toLowerCase();
  const filtradas = atividades.filter((item) => {
    if (!q) return true;
    return String(item.codigo || "").toLowerCase().includes(q)
      || String(item.descricao || "").toLowerCase().includes(q)
      || String(item.rotuloAnexo || "").toLowerCase().includes(q);
  });
  if (!filtradas.length) {
    lista.hidden = false;
    lista.innerHTML = `<p class="ajuda" style="padding:0.6rem">Nenhuma atividade encontrada nessa data.</p>`;
    return;
  }
  lista.innerHTML = filtradas.map((item, indice) => {
    const anexo = item.rotuloCurtoAnexo || item.rotuloAnexo || "sem anexo";
    const marca = item.disponivel === false ? " · indisponível com os filtros" : "";
    return `<button type="button" class="sugestao" data-i="${indice}"><span class="codigo">${escapar(item.codigo)}</span> ${escapar(item.descricao || "")}<small>Anexo ${escapar(anexo)}${escapar(marca)}</small></button>`;
  }).join("");
  lista.hidden = false;
  lista.querySelectorAll(".sugestao").forEach((botao) => {
    botao.addEventListener("click", () => {
      escolherAtividade(filtradas[Number(botao.dataset.i)]);
    });
  });
}

function escolherAtividade(item) {
  document.getElementById("sn-atividade").value = item.codigo || "";
  document.getElementById("sn-busca").value = `${item.codigo} — ${item.descricao || ""}`;
  document.getElementById("sn-sugestoes").hidden = true;
  const anexo = item.rotuloAnexo ? ` Anexo: ${item.rotuloAnexo}.` : "";
  document.getElementById("sn-atividade-escolhida").textContent = `${item.descricao || "Atividade selecionada."}${anexo}`;
}

function preencherExemploSimples() {
  document.getElementById("sn-data").value = "2027-03-15";
  document.getElementById("sn-atividade").value = "01";
  document.getElementById("sn-busca").value = "01 — Revenda de mercadorias";
  document.getElementById("sn-atividade-escolhida").textContent = "Exemplo do contrato oficial: atividade 01, classificação 000001, NF-e, CRT 1.";
  document.getElementById("sn-classtrib").value = "000001";
  document.getElementById("sn-tpdoc").value = "55";
  document.getElementById("sn-crt").value = "1";
  document.getElementById("sn-regime").value = "";
  document.getElementById("sn-base").value = "950.00";
  document.getElementById("sn-is").value = "0.00";
  document.getElementById("sn-pcbs").value = "2.75";
  document.getElementById("sn-pibs").value = "1.25";
  document.getElementById("sn-ente").value = "";
  atividadesCache = { data: "", lista: [] };
}

function limparSimples() {
  document.getElementById("form-simples").reset();
  document.getElementById("sn-data").value = "2027-03-15";
  document.getElementById("sn-is").value = "0.00";
  document.getElementById("sn-atividade-escolhida").textContent = "Nenhuma atividade selecionada. A lista vem da calculadora na data do fato gerador.";
  document.getElementById("sn-sugestoes").hidden = true;
  memoria.simples = null;
  atividadesCache = { data: "", lista: [] };
  document.getElementById("sn-alertas").innerHTML = "";
  document.getElementById("sn-cards").hidden = true;
  document.getElementById("sn-vazio").hidden = false;
  document.getElementById("sn-tabela").innerHTML = "";
  document.getElementById("sn-json").textContent = "Nenhum cálculo ainda.";
}

function corpoSimples() {
  const corpo = {
    id: "507f1f77bcf86cd799439011",
    versao: "2.0.0",
    data: document.getElementById("sn-data").value,
    tpDoc: document.getElementById("sn-tpdoc").value,
    CRT: document.getElementById("sn-crt").value,
    itens: [{
      numero: 1,
      cAtivSN: document.getElementById("sn-atividade").value.trim(),
      cClassTrib: document.getElementById("sn-classtrib").value.trim(),
      baseCalculo: document.getElementById("sn-base").value.trim(),
      valorImpostoSeletivo: document.getElementById("sn-is").value.trim() || "0.00",
      pCBSSN: document.getElementById("sn-pcbs").value.trim(),
      pIBSSN: document.getElementById("sn-pibs").value.trim()
    }]
  };
  const regime = document.getElementById("sn-regime").value;
  const ente = document.getElementById("sn-ente").value;
  if (regime) corpo.tpRegimeIBSCBS = regime;
  if (ente) corpo.tpEnteGov = ente;
  if (!corpo.itens[0].pCBSSN) delete corpo.itens[0].pCBSSN;
  if (!corpo.itens[0].pIBSSN) delete corpo.itens[0].pIBSSN;
  return corpo;
}

async function calcularSimples(evento) {
  evento.preventDefault();
  const botao = document.getElementById("btn-sn-calcular");
  const corpo = corpoSimples();
  const item = corpo.itens[0];
  if (!corpo.data || !item.cAtivSN || !item.cClassTrib || !item.baseCalculo) {
    mostrarAlertas("sn-alertas", [{ tipo: "erro", titulo: "Confira o formulário", texto: "Data, atividade, cClassTrib e base de cálculo são obrigatórios." }]);
    return;
  }
  ocupar(botao, true);
  mostrarAlertas("sn-alertas", []);
  try {
    const resposta = await fetch("/proxy/simples/api/calculadora/observabilidade/simples-nacional", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo)
    });
    const lido = await lerCorpo(resposta);
    if (!lido.ok) {
      const erros = coletarErros(detalheEstruturado(lido), "VSN-");
      mostrarAlertas("sn-alertas", [{
        tipo: "erro",
        titulo: "A calculadora não concluiu o cálculo",
        texto: erros.length ? "" : mensagemFalha(lido),
        html: erros.length ? `<ul>${htmlErros(erros, GLOSSARIO_VSN)}</ul>` : ""
      }]);
      return;
    }
    memoria.simples = lido.json || {};
    pintarSimples(memoria.simples);
  } catch {
    mostrarAlertas("sn-alertas", [{ tipo: "erro", titulo: "Sem resposta", texto: "O portal não conseguiu falar com a calculadora do Simples Nacional." }]);
  } finally {
    ocupar(botao, false);
  }
}

function pintarSimples(dados) {
  const total = dados.total || {};
  const objetos = Array.isArray(dados.objetos) ? dados.objetos : [];
  const primeiro = objetos[0] && objetos[0].tribCalc ? objetos[0].tribCalc : {};
  document.getElementById("sn-vazio").hidden = true;
  document.getElementById("sn-cards").hidden = false;
  document.getElementById("sn-valor-cbs").textContent = moeda(total.vCBSSNtot);
  document.getElementById("sn-valor-ibs").textContent = moeda(total.vIBSSNtot);
  document.getElementById("sn-valor-is").textContent = moeda(total.totalIs);
  document.getElementById("sn-valor-rb").textContent = moeda(total.vRBSNtot);
  document.getElementById("sn-valor-total").textContent = moeda(total.totalTributos);
  document.getElementById("sn-aliq-cbs").textContent = percentual(primeiro.pCBSSN);
  document.getElementById("sn-aliq-ibs").textContent = percentual(primeiro.pIBSSN);
  document.getElementById("sn-json").textContent = JSON.stringify(dados, null, 2);

  const linhas = objetos.map((objeto) => {
    const t = objeto.tribCalc || {};
    const estado = ESTADOS[objeto.estadoItem] || objeto.estadoItem || "—";
    return `<tr>
      <td>${escapar(objeto.nObj ?? "—")}</td>
      <td>${escapar(estado)}</td>
      <td>${escapar(t.tpRBSNDescricao || t.tpRBSN || "—")}</td>
      <td class="num">${moeda(t.vBC)}</td>
      <td class="num">${moeda(t.vCBSSN)}</td>
      <td class="num">${moeda(t.vIBSSN)}</td>
      <td class="num">${moeda(t.totalItem)}</td>
    </tr>`;
  }).join("");
  document.getElementById("sn-tabela").innerHTML = linhas
    ? `<table><thead><tr><th>Item</th><th>Situação</th><th>Receita</th><th class="num">Base IBS/CBS</th><th class="num">CBS</th><th class="num">IBS</th><th class="num">Item</th></tr></thead><tbody>${linhas}</tbody></table>`
    : "";

  const erros = coletarErros(dados, "VSN-");
  mostrarAlertas("sn-alertas", erros.length
    ? [{ tipo: "erro", titulo: "A calculadora apontou inconsistências", html: `<ul>${htmlErros(erros, GLOSSARIO_VSN)}</ul>` }]
    : []);
}

function ligarArquivoXml() {
  const zona = document.getElementById("dropzone");
  const arquivo = document.getElementById("danfse-arquivo");
  ["dragenter", "dragover"].forEach((nome) => {
    zona.addEventListener(nome, (evento) => {
      evento.preventDefault();
      zona.classList.add("arrastando");
    });
  });
  ["dragleave", "drop"].forEach((nome) => {
    zona.addEventListener(nome, (evento) => {
      evento.preventDefault();
      zona.classList.remove("arrastando");
    });
  });
  zona.addEventListener("drop", (evento) => {
    const file = evento.dataTransfer.files && evento.dataTransfer.files[0];
    if (file) lerArquivoXml(file);
  });
  arquivo.addEventListener("change", () => {
    const file = arquivo.files && arquivo.files[0];
    if (file) lerArquivoXml(file);
  });
}

function lerArquivoXml(file) {
  const leitor = new FileReader();
  leitor.onload = () => {
    document.getElementById("danfse-xml").value = String(leitor.result || "");
  };
  leitor.readAsText(file);
}

function limparDanfse() {
  document.getElementById("form-danfse").reset();
  document.getElementById("danfse-canhoto").checked = true;
  document.getElementById("danfse-xml").value = "";
  document.getElementById("danfse-alertas").innerHTML = "";
  document.getElementById("danfse-vazio").hidden = false;
  document.getElementById("danfse-acoes").hidden = true;
  const visor = document.getElementById("danfse-visor");
  visor.hidden = true;
  visor.removeAttribute("src");
  if (memoria.pdf) URL.revokeObjectURL(memoria.pdf);
  memoria.pdf = "";
}

async function gerarDanfse(evento) {
  evento.preventDefault();
  const botao = document.getElementById("btn-danfse");
  const xml = document.getElementById("danfse-xml").value.trim();
  if (!xml) {
    mostrarAlertas("danfse-alertas", [{ tipo: "erro", titulo: "XML vazio", texto: "Solte um arquivo .xml da NFS-e ou cole o conteúdo." }]);
    return;
  }
  const stc = document.getElementById("danfse-stc").value;
  const canhoto = document.getElementById("danfse-canhoto").checked ? "true" : "false";
  ocupar(botao, true);
  mostrarAlertas("danfse-alertas", []);
  try {
    const resposta = await fetch(`/proxy/danfse/api/danfse?stc=${encodeURIComponent(stc)}&canhoto=${canhoto}`, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/pdf, application/json" },
      body: xml
    });
    const tipo = resposta.headers.get("content-type") || "";
    if (!resposta.ok || tipo.includes("json") || tipo.includes("text")) {
      const lido = await lerCorpo(resposta);
      mostrarAlertas("danfse-alertas", [{ tipo: "erro", titulo: "O DANFSe não foi gerado", texto: mensagemFalha(lido) }]);
      return;
    }
    const binario = await resposta.arrayBuffer();
    const bytes = new Uint8Array(binario.slice(0, 5));
    const assinatura = String.fromCharCode(...bytes);
    if (!assinatura.startsWith("%PDF")) {
      mostrarAlertas("danfse-alertas", [{ tipo: "erro", titulo: "Resposta inesperada", texto: "O serviço não devolveu um PDF." }]);
      return;
    }
    if (memoria.pdf) URL.revokeObjectURL(memoria.pdf);
    memoria.pdf = URL.createObjectURL(new Blob([binario], { type: "application/pdf" }));
    const visor = document.getElementById("danfse-visor");
    visor.src = memoria.pdf;
    visor.hidden = false;
    const baixar = document.getElementById("danfse-baixar");
    baixar.href = memoria.pdf;
    document.getElementById("danfse-acoes").hidden = false;
    document.getElementById("danfse-vazio").hidden = true;
    mostrarAlertas("danfse-alertas", [{ tipo: "ok", titulo: "DANFSe pronto", texto: "O PDF está no painel ao lado e pode ser baixado como danfse.pdf." }]);
  } catch {
    mostrarAlertas("danfse-alertas", [{ tipo: "erro", titulo: "Sem resposta", texto: "O portal não conseguiu falar com o gerador de DANFSe." }]);
  } finally {
    ocupar(botao, false);
  }
}

async function copiarJson(dados, idBotao) {
  copiarTexto(dados ? JSON.stringify(dados, null, 2) : "", idBotao, "Copiar JSON");
}

async function copiarTexto(texto, idBotao, rotulo) {
  const botao = document.getElementById(idBotao);
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = "Copiado";
    window.setTimeout(() => { botao.textContent = rotulo; }, 1400);
  } catch {
    botao.textContent = "Não foi possível copiar";
    window.setTimeout(() => { botao.textContent = rotulo; }, 1400);
  }
}
