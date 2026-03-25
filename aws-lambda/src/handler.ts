import type { APIGatewayProxyHandler } from "aws-lambda";
import type { JiraSyncRequest, JiraSyncResponse } from "./types.js";
import { createComment, updateComment, type JiraConfig } from "./jira-client.js";
import { buildCostTable } from "./adf-builder.js";

function getJiraConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error("Missing required environment variables: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN");
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, apiToken };
}

function respond(statusCode: number, body: JiraSyncResponse) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const config = getJiraConfig();

    if (!event.body) {
      return respond(400, { success: false, comment_id: "", error: "Missing request body" });
    }

    const request: JiraSyncRequest = JSON.parse(event.body);

    if (!request.ticket_id || !request.sessions) {
      return respond(400, { success: false, comment_id: "", error: "Missing ticket_id or sessions" });
    }

    const adfBody = buildCostTable(request.sessions, request.total_cost_usd);

    let commentId: string;
    if (request.comment_id) {
      commentId = await updateComment(config, request.ticket_id, request.comment_id, adfBody);
    } else {
      commentId = await createComment(config, request.ticket_id, adfBody);
    }

    return respond(200, { success: true, comment_id: commentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return respond(500, { success: false, comment_id: "", error: message });
  }
};
