import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { localnet } from "genlayer-js/chains";

const ENDPOINT = "https://studio.genlayer.com/api";
const CONTRACT = "0x53Fa17B148006bd59B2484ef8414840ECfaAfd06";
const STUDIO = { ...localnet, id: 6199, name: "GenLayer Studio Network",
  rpcUrls: { default: { http: [ENDPOINT] } },
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 } };

const _orig = console.error.bind(console);
console.error = (...a) => /Method not found/.test(JSON.stringify(a)) ? null : _orig(...a);

const client = createClient({ chain: STUDIO, endpoint: ENDPOINT, account: createAccount(generatePrivateKey()) });
try {
  const owner = await client.readContract({ address: CONTRACT, functionName: "owner", args: [] });
  console.log("contract owner:", owner);
} catch (e) {
  console.log("err:", e?.message?.slice(0, 200));
}
