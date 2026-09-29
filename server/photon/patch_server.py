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
protocol.write_text(s)

server = Path("/src/photon-server/PhotonServer.cs")
s = server.read_text()

needle = """                case OpCode.Authenticate:
                {
"""
insert = """                case OpCode.GetRegions:
                {
                    var resp = BuildOpResp(peer, OpCode.GetRegions, 0, null,
                        new Dictionary<byte, object?>
                        {
                            [Param.Region] = new[] { "eu" },
                            [Param.Address] = new[] { _publicAddress }
                        });
                    SendReliableMessage(peer, cmd.Channel, resp);
                    Log($"[{peer.EndPoint}]   GET REGIONS -> eu / {_publicAddress}");
                    break;
                }
                case OpCode.Authenticate:
                {
"""
if needle not in s:
    raise SystemExit("Authenticate switch location not found")
s = s.replace(needle, insert, 1)

needle = """                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
"""
replace = """                            [Param.Secret] = peer.SessionToken,
                            [Param.UserId] = peer.UserId,
                            [Param.Address] = _publicAddress,
"""
if needle not in s:
    raise SystemExit("Auth response location not found")
s = s.replace(needle, replace, 1)

server.write_text(s)
