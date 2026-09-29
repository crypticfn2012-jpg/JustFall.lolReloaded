from pathlib import Path

protocol = Path("/src/photon-server/Protocol.cs")
s = protocol.read_text()

s = s.replace(
    "public const byte Authenticate   = 230;",
    "public const byte Authenticate   = 230;\n        public const byte GetRegions    = 220;"
)
s = s.replace(
    "public const byte UserId           = 225;",
    "public const byte UserId           = 225;\n        public const byte Region          = 210;"
)

if "public const byte GetRegions    = 220;" not in s:
    raise SystemExit("Failed to add GetRegions opcode")
if "public const byte Region          = 210;" not in s:
    raise SystemExit("Failed to add Region parameter")

protocol.write_text(s)

server = Path("/src/photon-server/PhotonServer.cs")
s = server.read_text()

# Render gives us the public WSS endpoint. It must be passed through exactly
# as a Photon redirect address; do not append a UDP port.
old = """            // The game-server port the client redirects to is fixed by the SDK's
            // ServerPortOverrides (UDP GameServer = 27002), so advertise that.
            int gamePort = _ports.Contains(27002) ? 27002 : _ports[0];
            _publicAddress = $"{config.PublicHost}:{gamePort}";
"""
new = """            // For the browser build, the region/game-server redirect must stay
            // on the public WSS bridge. The bridge then forwards Photon packets
            // to this private UDP relay. PublicHost is therefore a complete URL.
            _publicAddress = config.PublicHost;
"""
if old not in s:
    raise SystemExit("PhotonServer public-address block not found")
s = s.replace(old, new, 1)

# Add GetRegions directly before Authenticate in the operation switch.
needle = """                case OpCode.Authenticate:
                {
"""
insert = """                case OpCode.GetRegions:
                {
                    var resp = BuildOpResp(peer, OpCode.GetRegions, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Region] = new[] { _config.Region },
                            [Param.Address] = new[] { _publicAddress }
                        });
                    SendReliableMessage(peer, cmd.Channel, resp);
                    Log($"[{peer.EndPoint}]   GET REGIONS -> {_config.Region} / {_publicAddress}");
                    break;
                }
                case OpCode.Authenticate:
                {
"""
if "case OpCode.GetRegions:" not in s:
    if needle not in s:
        raise SystemExit("Authenticate switch location not found")
    s = s.replace(needle, insert, 1)

server.write_text(s)
