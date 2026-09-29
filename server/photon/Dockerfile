FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/Segually/photon-server.git photon-server \
    && cd photon-server \
    && git checkout 1e7cf407ad835a95d7e91e8a005bcc7df46732a4

COPY server/photon/patch_server.py /tmp/patch_server.py
WORKDIR /src/photon-server
RUN python3 /tmp/patch_server.py
RUN dotnet publish photon-server.csproj -c Release -o /out --no-self-contained

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/ ./
COPY server/photon_entrypoint.sh /entrypoint.sh
COPY server/photon/health.py /health.py
RUN chmod +x /entrypoint.sh /health.py

EXPOSE 27001/udp
EXPOSE 10000
CMD ["/entrypoint.sh"]
