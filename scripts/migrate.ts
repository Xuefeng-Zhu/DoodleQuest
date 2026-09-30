import { migrate } from "../src/server/db";
migrate();
console.log("Database schema is current.");
