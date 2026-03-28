import "dotenv/config";
import { buildApp } from "./app";
import { config } from "./config";

const app = buildApp();

const start = async () => {
  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
