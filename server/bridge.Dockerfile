FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/photon_ws_bridge.js ./
EXPOSE 10000
CMD ["node","photon_ws_bridge.js"]