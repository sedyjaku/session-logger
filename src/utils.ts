export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function validateFields(
  obj: unknown,
  fields: string[]
): obj is Record<string, string> {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  for (const field of fields) {
    if (
      !(field in obj) ||
      typeof (obj as Record<string, unknown>)[field] !== "string"
    ) {
      return false;
    }
  }
  return true;
}
