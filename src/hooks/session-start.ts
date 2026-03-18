import * as readline from "readline";
import { createReadStream, createWriteStream } from "fs";
import { createSession } from "../services/session.service.js";
import { addLabel } from "../services/label.service.js";
import { closeDb } from "../db.js";
import type { SessionStartInput } from "../types.js";
import { readStdin, validateFields } from "../utils.js";

async function promptForLabels(sessionId: string): Promise<void> {
  let ttyRead: ReturnType<typeof createReadStream>;
  let ttyWrite: ReturnType<typeof createWriteStream>;

  try {
    ttyRead = createReadStream("/dev/tty");
    ttyWrite = createWriteStream("/dev/tty");
  } catch {
    return;
  }

  const rl = readline.createInterface({
    input: ttyRead,
    output: ttyWrite,
  });

  return new Promise((resolve) => {
    rl.question("Session labels (comma-separated, Enter to skip): ", (answer) => {
      rl.close();
      ttyRead.destroy();
      ttyWrite.destroy();

      try {
        if (answer.trim()) {
          const labels = answer.split(",").map((l) => l.trim()).filter(Boolean);
          for (const label of labels) {
            addLabel(sessionId, label);
          }
        }
      } catch {
      }

      resolve();
    });
  });
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw) as unknown;

    if (!validateFields(input, ["session_id", "transcript_path", "cwd", "source"])) {
      return;
    }

    const typedInput = input as unknown as SessionStartInput;

    createSession(
      typedInput.session_id,
      typedInput.transcript_path,
      typedInput.cwd,
      typedInput.model,
      typedInput.source
    );

    if (typedInput.source === "startup") {
      await promptForLabels(typedInput.session_id);
    }
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
