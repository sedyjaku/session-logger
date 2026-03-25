import { createServer } from "http";
import { handler } from "./handler.js";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

const port = parseInt(process.env.PORT || "3001");

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();

  const event = {
    body,
    httpMethod: req.method,
    headers: req.headers as Record<string, string>,
  } as unknown as APIGatewayProxyEvent;

  const result = await handler(event, {} as Context, () => {});

  if (!result || typeof result === "void") {
    res.writeHead(500);
    res.end("No response");
    return;
  }

  const response = result as { statusCode: number; headers?: Record<string, string>; body: string };
  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
});

server.listen(port, () => {
  console.log(`Lambda running locally on http://localhost:${port}`);
});
