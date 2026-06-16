export function requestLogger(request, response, next) {
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
    console.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs.toFixed(1)}ms`);
  });
  next();
}
