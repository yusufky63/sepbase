import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env"), quiet: true });

const privateKey = process.env.PRIVATE_KEY?.trim();
if (privateKey && /^[a-fA-F0-9]{64}$/.test(privateKey)) {
  process.env.PRIVATE_KEY = `0x${privateKey}`;
}
