from pathlib import Path

protocol = Path("Protocol.cs")
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

server = Path("PhotonServer.cs")
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

auth_old = """                    var resp = BuildOpResp(peer, OpCode.Authenticate, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
                        });"""
auth_new = """                    var resp = BuildOpResp(peer, OpCode.Authenticate, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
                            // NameServer authentication returns the regional
                            // Master Server address. We serve both through
                            // the same public WebSocket endpoint.
                            [Param.Address] = _publicAddress,
                        });"""
if auth_old not in s:
    raise SystemExit("Authenticate response block not found in PhotonServer.cs")
s = s.replace(auth_old, auth_new, 1)

server.write_text(s)
# Add the common room-property operations used during game initialization.
if "case OpCode.GetProperties:" not in s:
    marker = """                case OpCode.CreateGame:  HandleCreateGame(peer, cmd, msg); break;"""
    insert = """                case OpCode.LeaveLobby:
                {
                    SendReliableMessage(peer, cmd.Channel,
                        BuildOpResp(peer, OpCode.LeaveLobby, 0, null, null));
                    break;
                }
                case OpCode.GetProperties:
                {
                    if (peer.Room == null)
                    {
                        SendReliableMessage(peer, cmd.Channel,
                            BuildOpResp(peer, OpCode.GetProperties, 32760, "Not in a room", null));
                        break;
                    }

                    int target = msg.Parameters.TryGetValue(Param.ActorNr, out var at) && at != null
                        ? Convert.ToInt32(at) : 0;

                    var response = new Dictionary<byte, object?>();
                    if (target == 0)
                    {
                        response[Param.GameProperties] = ToDict(peer.Room.Properties);

                        var actorProps = new Dictionary<object, object?>();
                        foreach (var member in peer.Room.Members.Values)
                        {
                            var props = new Dictionary<object, object?>();
                            foreach (var kv in member.Properties) props[kv.Key] = kv.Value;
                            actorProps[member.ActorNr] = props;
                        }
                        response[Param.PlayerProperties] = actorProps;
                    }
                    else if (peer.Room.Members.TryGetValue(target, out var member))
                    {
                        var props = new Dictionary<object, object?>();
                        foreach (var kv in member.Properties) props[kv.Key] = kv.Value;
                        response[Param.PlayerProperties] = new Dictionary<object, object?>
                        {
                            [target] = props
                        };
                    }

                    SendReliableMessage(peer, cmd.Channel,
                        BuildOpResp(peer, OpCode.GetProperties, 0, null, response));
                    break;
                }
                case OpCode.CreateGame:  HandleCreateGame(peer, cmd, msg); break;"""
    if marker not in s:
        raise SystemExit("Operation switch insertion point not found")
    s = s.replace(marker, insert, 1)

server.write_text(s)
