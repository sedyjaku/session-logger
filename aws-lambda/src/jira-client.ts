export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

function authHeader(config: JiraConfig): string {
  return "Basic " + Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
}

export async function createComment(
  config: JiraConfig,
  ticketId: string,
  adfBody: object
): Promise<string> {
  const url = `${config.baseUrl}/rest/api/3/issue/${ticketId}/comment`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: adfBody }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

export async function updateComment(
  config: JiraConfig,
  ticketId: string,
  commentId: string,
  adfBody: object
): Promise<string> {
  const url = `${config.baseUrl}/rest/api/3/issue/${ticketId}/comment/${commentId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: adfBody }),
  });

  if (response.status === 404) {
    return createComment(config, ticketId, adfBody);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}
