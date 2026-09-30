from pathlib import Path

protocol_path = Path("Protocol.cs")
protocol = protocol_path.read_text()

# Add NameServer GetRegions support.
if "public const byte GetRegions" not in protocol:
    needle = "public const byte Authenticate   = 230;"
    if needle not in protocol:
        raise SystemExit("Protocol.cs Authenticate opcode not found")
    protocol = protocol.replace(
        needle,
        needle + "\n        public const byte GetRegions    = 220;",
        1
    )

# Add the Region parameter used by GetRegions.
if "public const byte Region          = 210;" not in protocol:
    needle = "public const byte UserId           = 225;"
    if needle not in protocol:
        raise SystemExit("Protocol.cs UserId parameter not found")
    protocol = protocol.replace(
        needle,
        needle + "\n        public const byte Region          = 210;",
        1
    )

protocol_path.write_text(protocol)

server_path = Path("PhotonServer.cs")
server = server_path.read_text()

# Browser clients must stay on the public WSS endpoint after master/game redirects.
old_public = """            // The game-server port the client redirects to is fixed by the SDK's
            // ServerPortOverrides (UDP GameServer = 27002), so advertise that.
            int gamePort = _ports.Contains(27002) ? 27002 : _ports[0];
            _publicAddress = $"{config.PublicHost}:{gamePort}";
"""
new_public = """            // Browser clients use the public WSS bridge for every Photon connection.
            _publicAddress = config.PublicHost;
"""
if "_publicAddress = config.PublicHost;" not in server:
    if old_public not in server:
        raise SystemExit("PhotonServer public-address block not found")
    server = server.replace(old_public, new_public, 1)

# Proper GetRegions response: both arrays must have the same length.
if "case OpCode.GetRegions:" not in server:
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
    if needle not in server:
        raise SystemExit("Authenticate switch not found")
    server = server.replace(needle, insert, 1)

# NameServer Authenticate response needs to return the MasterServer address.
if "[Param.Address] = _publicAddress," not in server:
    old_auth = """                    var resp = BuildOpResp(peer, OpCode.Authenticate, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
                        });"""
    new_auth = """                    var resp = BuildOpResp(peer, OpCode.Authenticate, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
                            [Param.Address] = _publicAddress,
                        });"""
    if old_auth not in server:
        raise SystemExit("Authenticate response block not found")
    server = server.replace(old_auth, new_auth, 1)

# Hosted containers have no interactive Photon console input.
if "StartConsoleThread();" in server:
    server = server.replace(
        "            StartConsoleThread();",
        "            // Interactive console disabled in hosted/container mode.",
        1
    )

# Add operations needed by the original client during room setup.
if "case OpCode.GetProperties:" not in server:
    needle = "                case OpCode.CreateGame:  HandleCreateGame(peer, cmd, msg); break;"
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
    if needle not in server:
        raise SystemExit("CreateGame switch not found")
    server = server.replace(needle, insert, 1)

server_path.write_text(server)

# Print runtime exceptions instead of dying without a useful stack trace.
program_path = Path("Program.cs")
program = program_path.read_text()
if "[FATAL] photon-server crashed during startup:" not in program:
    old_program = """Console.WriteLine("photon-server");
new PhotonServer.PhotonServer(config).Run();"""
    new_program = """Console.WriteLine("photon-server");
try
{
    Console.WriteLine("[Bootstrap] constructing PhotonServer...");
    var server = new PhotonServer.PhotonServer(config);
    Console.WriteLine("[Bootstrap] PhotonServer constructed");
    server.Run();
}
catch (Exception ex)
{
    Console.Error.WriteLine("[FATAL] photon-server crashed during startup:");
    Console.Error.WriteLine(ex.ToString());
    Environment.ExitCode = 1;
}"""
    if old_program not in program:
        raise SystemExit("Program.cs bootstrap block not found")
    program = program.replace(old_program, new_program, 1)
    program_path.write_text(program)

print("Photon patch completed successfully.")
