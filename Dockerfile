FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Segually/photon-server.git photon-server \
    && cd photon-server \
    && git fetch --depth 1 origin 1e7cf407ad835a95d7e91e8a005bcc7df46732a4 \
    && git checkout 1e7cf407ad835a95d7e91e8a005bcc7df46732a4

COPY server/photon/patch_server.py /tmp/patch_server.py
WORKDIR /src/photon-server
RUN python3 /tmp/patch_server.py
RUN dotnet publish photon-server.csproj -c Release -o /out --no-self-contained

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/ /app/photon/
COPY server/package.json /app/package.json
RUN npm install --omit=dev

COPY server/blitz_start.sh /app/blitz_start.sh
COPY server/render_bridge.js /app/render_bridge.js
COPY server/photon/health.py /app/health.py
RUN chmod +x /app/blitz_start.sh /app/health.py

EXPOSE 8080
ENV PORT=8080
CMD ["/app/blitz_start.sh"]