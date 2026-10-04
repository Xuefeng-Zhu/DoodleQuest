import { ready, closeDatabase } from "../src/server/db";
await ready();
await closeDatabase();
console.log("Database schema is current.");
