import { getDb } from "../src/server/db/connect";

getDb()
  .then(() => {
    console.log("Database migrated (and seeded if empty).");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
