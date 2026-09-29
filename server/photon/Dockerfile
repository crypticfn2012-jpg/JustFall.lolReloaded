FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
RUN git clone --depth 1 https://github.com/Segually/photon-server.git photon-server
WORKDIR /src/photon-server
RUN sed -i 's#_publicAddress = .*#_publicAddress = config.PublicHost;#' PhotonServer.cs
RUN dotnet publish photon-server.csproj -c Release -o /out --no-self-contained

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out/ ./
COPY server/photon_entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 27001/udp
CMD ["/entrypoint.sh"]