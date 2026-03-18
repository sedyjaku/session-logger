import { endSession } from "../services/session.service.js";
import { closeDb } from "../db.js";
import type { SessionEndInput } from "../types.js";
import { readStdin, validateFields } from "../utils.js";

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw) as unknown;

    if (!validateFields(input, ["session_id", "transcript_path"])) {
      return;
    }

    const typedInput = input as unknown as SessionEndInput;

    endSession(typedInput.session_id, typedInput.transcript_path, typedInput.reason);
  } catch {
  } finally {
    try {
      closeDb();
    } catch {
    }
    process.exit(0);
  }
}

main();
