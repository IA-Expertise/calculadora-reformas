# Imagem enxuta para o Railway. A porta vem de PORT (padrão 3000).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public

RUN chown -R node:node /app
USER node

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
