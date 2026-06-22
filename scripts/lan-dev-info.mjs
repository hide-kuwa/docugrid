import { getLanIp } from "./get-lan-ip.mjs";

const ip = getLanIp();

console.log("");
console.log("DocuGrid LAN dev URLs");
console.log("=====================");
console.log(`This PC:     http://localhost:3000`);
console.log(`Other PCs:   http://${ip}:3000`);
console.log(`API base:    http://${ip}:8000/api`);
console.log("");
console.log("Login (dev): admin@tax.co.jp / password");
console.log("");
