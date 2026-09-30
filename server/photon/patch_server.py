from pathlib import Path
import re

ROOT = Path(".")

def read(name):
    p = ROOT / name
    return p, p.read_text()

def require_once_replace(text, pattern, replacement, name):
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count == 0:
        raise SystemExit(f"Could not patch {name}")
    return out

# ---------------------------------------------------------------------------
# Protocol.cs
# ---------------------------------------------------------------------------
protocol_path, protocol = read("Protocol.cs")

if "public const byte GetRegions" not in protocol:
    protocol, count = re.subn(
        r"(public const byte Authenticates*=s*230;s*)",
        r"\1        public const byte GetRegions    = 220;
",
        protocol,
        count=1,
    )
    if count != 1:
        raise SystemExit("Could not add GetRegions opcode")

if "public const byte Region" not in protocol:
    protocol, count = re.subn(
        r"(public const byte UserIds*=s*225;s*)",
        r"\1        public const byte Region          = 210;
",
        protocol,
        count=1,
    )
    if count != 1:
        raise SystemExit("Could not add Region parameter")

protocol_path.write_text(protocol)

# ---------------------------------------------------------------------------
# PhotonServer.cs
# ---------------------------------------------------------------------------
server_path, server = read("PhotonServer.cs")

# Browser clients must reconnect through the same WSS bridge after master
# redirects. Never advertise the private UDP port.
server, count = re.subn(
    r'// The game-server port the client redirects to.*?'
    r'_publicAddresss*=s*$"\{config.PublicHost\}:\{gamePort\}";',
    '// Browser clients use the public WSS bridge for every connection.\n'
    '            _publicAddress = config.PublicHost;',
    server,
    count=1,
    flags=re.MULTILINE | re.DOTALL,
)
if count != 1 and "_publicAddress = config.PublicHost;" not in server:
    raise SystemExit("Could not patch public Photon address")

# Add a proper Name Server GetRegions response. The Unity Photon client expects
# region and address arrays of equal length.
if "case OpCode.GetRegions:" not in server:
    marker = "                case OpCode.Authenticate:\n                {"
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
                {"""
    if marker not in server:
        raise SystemExit("Could not find Authenticate switch")
    server = server.replace(marker, insert, 1)

# Name Server auth must return Address as well as Secret/UserId.
if "[Param.Address] = _publicAddress" not in server:
    auth_pattern = (
        r"(var resp = BuildOpResp\(peer, OpCode\.Authenticate, 0, null,\s*"
        r"new Dictionary<byte, object\?>\s*\{\s*"
        r"\[Param\.Secret\] = peer\.SessionToken,\s*"
        r"\[Param\.UserId\] = peer\.UserId,\s*"
        r"\}\);)"
    )
    replacement = """var resp = BuildOpResp(peer, OpCode.Authenticate, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
                            [Param.Address] = _publicAddress,
                        });"""
    server, count = re.subn(auth_pattern, replacement, server, count=1)
    if count != 1:
        raise SystemExit("Could not patch Authenticate response")

# Keep the container non-interactive. The upstream server starts a console
# reader which has no useful purpose in a hosted WebSocket service.
server, count = re.subn(
    r"^s*StartConsoleThread();s*$",
    "            // No interactive console in hosted/container mode.",
    server,
    count=1,
)
if count != 1 and "No interactive console in hosted/container mode." not in server:
    raise SystemExit("Could not disable console thread")

# Add room/property operations only once.
if "case OpCode.LeaveLobby:" not in server:
    marker = "                case OpCode.CreateGame:  HandleCreateGame(peer, cmd, msg); break;"
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
                            foreach (var kv in member.Properties)
                                props[kv.Key] = kv.Value;
                            actorProps[member.ActorNr] = props;
                        }
                        response[Param.PlayerProperties] = actorProps;
                    }
                    else if (peer.Room.Members.TryGetValue(target, out var member))
                    {
                        var props = new Dictionary<object, object?>();
                        foreach (var kv in member.Properties)
                            props[kv.Key] = kv.Value;

                        response[Param.PlayerProperties] =
                            new Dictionary<object, object?>
                            {
                                [target] = props
                            };
                    }

                    SendReliableMessage(peer, cmd.Channel,
                        BuildOpResp(peer, OpCode.GetProperties, 0, null, response));
                    break;
                }
                case OpCode.CreateGame:  HandleCreateGame(peer, cmd, msg); break;"""
    if marker not in server:
        raise SystemExit("Could not find CreateGame switch")
    server = server.replace(marker, insert, 1)

server_path.write_text(server)

# ---------------------------------------------------------------------------
# Program.cs — print startup exceptions rather than dying with only the banner
# ---------------------------------------------------------------------------
program_path, program = read("Program.cs")
if "[FATAL] photon-server crashed during startup:" not in program:
    pattern = r'Console.WriteLine("photon-server");s*new PhotonServer.PhotonServer(config).Run();'
    replacement = """Console.WriteLine("photon-server");
try
{
    Console.WriteLine("[Bootstrap] constructing PhotonServer...");
    var server = new PhotonServer.PhotonServer(config);
    Console.WriteLine("[Bootstrap] PhotonServer constructed");
    server.Run();
    Console.WriteLine("[Bootstrap] PhotonServer.Run returned");
}
catch (Exception ex)
{
    Console.Error.WriteLine("[FATAL] photon-server crashed during startup:");
    Console.Error.WriteLine(ex.ToString());
    Environment.ExitCode = 1;
}"""
    program, count = re.subn(pattern, replacement, program, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise SystemExit("Could not patch Program.cs startup")

program_path.write_text(program)

print("Photon patch completed successfully.")
