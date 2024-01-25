import { config } from "dotenv";
import { cleanEnv, str, url } from "envalid";

await config({ export: true });

export default cleanEnv(Deno.env.toObject(), {
  BOT_TOKEN: str(),
  OWNERS: str(),
  MONGO_URL: url(),
  DEFAULT_API_KEY: str(),
});
