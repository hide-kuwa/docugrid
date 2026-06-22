import os from "node:os";

function scoreInterface(name) {
  const n = name.toLowerCase();
  if (n.includes("wi-fi") || n.includes("wlan") || n.includes("wireless")) return 100;
  if (n.includes("ethernet") || n.includes("eth")) return 90;
  if (n.includes("local area") || n.includes("ローカル")) return 85;
  if (n.includes("hotspot") || n.includes("vEthernet") || n.includes("vethernet")) return 10;
  if (n.includes("virtual") || n.includes("vmware") || n.includes("hyper-v")) return 5;
  return 40;
}

function isPrivateIpv4(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  if (ip.startsWith("127.")) return false;
  if (ip.startsWith("169.254.")) return false;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

/** Pick the best LAN IPv4 for sharing on the local network. */
export function getLanIp() {
  const candidates = [];

  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" && addr.family !== 4) continue;
      if (addr.internal || !isPrivateIpv4(addr.address)) continue;
      candidates.push({
        ip: addr.address,
        score: scoreInterface(name),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length === 0) {
    throw new Error("LAN IPv4 address not found. Connect Wi-Fi/Ethernet and retry.");
  }
  return candidates[0].ip;
}

const isCli = process.argv[1]?.replace(/\\/g, "/").endsWith("/get-lan-ip.mjs");
if (isCli) {
  try {
    process.stdout.write(getLanIp());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
