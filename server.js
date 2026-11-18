"use strict";

/**
 * Portal das calculadoras da Reforma Tributária (LC 214/2025).
 *
 * Serve a interface em public/ e encaminha as chamadas às três APIs oficiais.
 * O navegador só enxerga este processo, então não há CORS nem endereço interno
 * na página.
 */

require("dotenv").config();

const express = require("express");
const http = require("http");
const https = require("https");
const path = require("path");

const PORTA = Number(process.env.PORT) || 3000;
const LIMITE_CORPO = 8 * 1024 * 1024;
const PASTA_PUBLICA = path.join(__dirname, "public");

const VARIAVEIS_API = [
  "API_REGIME_REGULAR_URL",
  "API_SIMPLES_NACIONAL_URL",
  "API_DANFSE_URL",
];

/** Tira da mensagem qualquer origem configurada, para não vazar host interno. */
function redigir(texto) {
  let saida = String(texto ?? "");
  for (const nome of VARIAVEIS_API) {
    const valor = String(process.env[nome] || "").trim().replace(/\/+$/, "");
    if (valor) saida = saida.split(valor).join("[serviço]");
  }
  return saida;
}

function mensagemStatus(status) {
  if (status === 400) return "A API não reconheceu a requisição.";
  if (status === 404) return "A API não encontrou este caminho.";
  if (status === 422) return "A API recusou os dados enviados.";
  if (status >= 500) return "A API encontrou um erro interno.";
  return `A API respondeu com status ${status}.`;
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on("data", (pedaco) => {
      total += pedaco.length;
      if (total > LIMITE_CORPO) {
        const erro = new Error("limite");
        erro.status = 413;
        reject(erro);
        req.destroy();
        return;
      }
      partes.push(pedaco);
    });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

/**
 * Junta a origem configurada com o caminho pedido pelo navegador.
 * A variável de ambiente é a origem (pode ter um prefixo de caminho).
 */
function montarDestino(base, resto) {
  const origem = new URL(base);
  const interrogacao = resto.indexOf("?");
  const caminho = interrogacao >= 0 ? resto.slice(0, interrogacao) : resto;
  const busca = interrogacao >= 0 ? resto.slice(interrogacao + 1) : "";
  const prefixo = origem.pathname.replace(/\/+$/, "");
  const sufixo = caminho.startsWith("/") ? caminho : `/${caminho}`;
  origem.pathname = `${prefixo}${sufixo}`.replace(/\/{2,}/g, "/") || "/";
  origem.search = busca;
  return origem;
}

function criarProxy(nomeVariavel, timeoutMs) {
  const metodos = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

  return async (req, res) => {
    try {
      if (!metodos.has(req.method)) {
        res.status(405).json({
          erro: "Método não suportado",
          detalhe: "Este proxy encaminha os métodos HTTP usuais.",
        });
        return;
      }

      const base = String(process.env[nomeVariavel] || "").trim();
      if (!base) {
        res.status(503).json({
          erro: "API não configurada",
          detalhe: `Defina a variável ${nomeVariavel} no ambiente do portal.`,
        });
        return;
      }

      const resto = req.url && req.url !== "" ? req.url : "/";
      if (resto.includes("://") || resto.startsWith("//")) {
        res.status(400).json({
          erro: "Caminho inválido",
          detalhe: "O caminho precisa ser relativo ao serviço.",
        });
        return;
      }

      let destino;
      try {
        destino = montarDestino(base, resto);
      } catch {
        res.status(500).json({
          erro: "Configuração inválida",
          detalhe: "A URL configurada para esta API não pôde ser lida.",
        });
        return;
      }

      let corpo = Buffer.alloc(0);
      if (req.method !== "GET" && req.method !== "HEAD") {
        corpo = await lerCorpo(req);
      }

      const cabecalhos = {};
      if (req.headers["content-type"]) cabecalhos["Content-Type"] = req.headers["content-type"];
      if (req.headers.accept) cabecalhos.Accept = req.headers.accept;
      if (corpo.length) cabecalhos["Content-Length"] = corpo.length;

      const cliente = destino.protocol === "https:" ? https : http;
      await new Promise((resolve) => {
        let timer = null;
        const upstream = cliente.request(
          {
            protocol: destino.protocol,
            hostname: destino.hostname,
            port: destino.port || (destino.protocol === "https:" ? 443 : 80),
            path: `${destino.pathname}${destino.search}`,
            method: req.method,
            headers: cabecalhos,
          },
          (resposta) => {
            const pedacos = [];
            resposta.on("data", (pedaco) => pedacos.push(pedaco));
            resposta.on("end", () => {
              if (timer) clearTimeout(timer);
              if (res.headersSent) {
                resolve();
                return;
              }
              const buffer = Buffer.concat(pedacos);
              const status = resposta.statusCode || 502;
              res.setHeader("Cache-Control", "no-store");

              if (status >= 400) {
                const texto = buffer.length ? redigir(buffer.toString("utf8")).slice(0, 4000) : "";
                res.status(status).json({
                  erro: mensagemStatus(status),
                  detalhe: texto || "A API não enviou detalhes.",
                });
                resolve();
                return;
              }

              const tipo = resposta.headers["content-type"];
              if (tipo) res.setHeader("Content-Type", tipo);
              const disposicao = resposta.headers["content-disposition"];
              if (disposicao && !/https?:\/\//i.test(String(disposicao))) {
                res.setHeader("Content-Disposition", disposicao);
              }
              const aviso = resposta.headers["x-warning-dados-simulados"];
              if (aviso) res.setHeader("x-warning-dados-simulados", redigir(String(aviso)).slice(0, 500));
              res.status(status).send(buffer);
              resolve();
            });
          }
        );

        timer = setTimeout(() => {
          upstream.destroy();
          if (!res.headersSent) {
            res.status(504).json({
              erro: "Tempo esgotado",
              detalhe: "A API não respondeu a tempo.",
            });
          }
          resolve();
        }, timeoutMs);

        upstream.on("error", () => {
          if (timer) clearTimeout(timer);
          if (!res.headersSent) {
            res.status(502).json({
              erro: "API indisponível",
              detalhe: "Não foi possível conectar ao serviço.",
            });
          }
          resolve();
        });

        res.on("close", () => {
          if (!res.writableEnded) upstream.destroy();
        });

        if (corpo.length) upstream.write(corpo);
        upstream.end();
      });
    } catch (erro) {
      if (res.headersSent) return;
      const status = erro && erro.status === 413 ? 413 : 500;
      res.status(status).json({
        erro: status === 413 ? "Arquivo grande demais" : "Falha no proxy",
        detalhe: status === 413 ? "O limite deste portal é 8 MB." : "Não foi possível encaminhar a requisição.",
      });
    }
  };
}

const app = express();
app.disable("x-powered-by");

/** Saúde do próprio portal. Não consulta as APIs de cálculo. */
app.get(["/health", "/health/live"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok", servico: "portal-calculadoras-rtc" });
});

app.use("/proxy/regime-regular", criarProxy("API_REGIME_REGULAR_URL", 45000));
app.use("/proxy/simples", criarProxy("API_SIMPLES_NACIONAL_URL", 45000));
app.use("/proxy/danfse", criarProxy("API_DANFSE_URL", 60000));

app.use(express.static(PASTA_PUBLICA, { index: "index.html" }));

app.use((req, res) => {
  if (req.path.startsWith("/proxy/")) {
    res.status(404).json({
      erro: "Proxy não encontrado",
      detalhe: "Use regime-regular, simples ou danfse.",
    });
    return;
  }
  res.status(404).sendFile(path.join(PASTA_PUBLICA, "index.html"));
});

app.listen(PORTA, "0.0.0.0", () => {
  console.log(`Portal das calculadoras RTC ouvindo na porta ${PORTA}`);
});
