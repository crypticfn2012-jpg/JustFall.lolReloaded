FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin the upstream Photon-compatible server source so production builds are
# reproducible instead of silently changing when the public repo changes.
RUN git clone https://github.com/Segually/photon-server.git photon-server \
    && cd photon-server \
    && git checkout 1e7cf407ad835a95d7e91e8a005bcc7df46732a4

COPY server/photon/patch_server.py /tmp/patch_server.py
RUN python3 /tmp/patch_server.py

WORKDIR /src/photon-server
RUN dotnet publish photon-server.csproj -c Release -o /out --no-self-contained

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out/ ./
COPY server/photon_entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 27001/udp
CMD ["/entrypoint.sh"]
