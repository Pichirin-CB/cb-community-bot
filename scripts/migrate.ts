import { env } from "../src/config/env.js";
import { Database } from "../src/database/database.js";

const database = new Database(env.DATABASE_PATH);
database.migrate();
database.close();
console.log(`Migraciones aplicadas en ${env.DATABASE_PATH}`);
