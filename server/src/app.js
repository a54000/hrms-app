import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import routes from "./routes/index.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || origin === allowedOrigin || /^http:\/\/(localhost|127\.0\.0\.1):517\d$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());
app.use(requestLogger);

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "hrguru-hrms-server" });
});

app.use("/api", routes);
app.use(errorHandler);

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(port, () => {
    console.log(`HR Guru HRMS server listening on port ${port}`);
  });
}

export default app;
