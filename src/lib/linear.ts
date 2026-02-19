import { LinearClient } from "@linear/sdk";
import { auth } from "./auth";

export class LinearAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearAuthError";
  }
}

export async function getLinearClient() {
  const session = await auth();
  if (session?.error === "RefreshTokenError" || session?.error === "RefreshTokenMissing") {
    throw new LinearAuthError("Linear session expired");
  }
  if (!session?.accessToken) {
    throw new LinearAuthError("No Linear access token found");
  }
  return new LinearClient({ accessToken: session.accessToken });
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: string;
}

export interface LinearMilestone {
  id: string;
  name: string;
  description?: string;
  targetDate?: string;
}

export interface LinearLabel {
  id: string;
  name: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: {
    name: string;
    color: string;
  };
  priority: number;
}

export async function getProjects(): Promise<LinearProject[]> {
  try {
    const client = await getLinearClient();
    const projects = await client.projects({
      first: 100,
      filter: {
        state: { in: ["backlog", "planned", "started"] },
      },
    });

    return projects.nodes.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      state: p.state,
    }));
  } catch (error) {
    console.error("Failed to fetch Linear projects:", error);
    return [];
  }
}

export async function getMilestones(projectId?: string): Promise<LinearMilestone[]> {
  try {
    const client = await getLinearClient();

    // Linear calls these "Project Milestones"
    const milestones = await client.projectMilestones({
      first: 100,
      ...(projectId && {
        filter: {
          project: { id: { eq: projectId } },
        },
      }),
    });

    return milestones.nodes.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description ?? undefined,
      targetDate: m.targetDate ?? undefined,
    }));
  } catch (error) {
    console.error("Failed to fetch Linear milestones:", error);
    return [];
  }
}

export async function getIssues(search?: string): Promise<LinearIssue[]> {
  try {
    const client = await getLinearClient();

    // Check if search looks like an issue identifier (e.g., "ENG-123") or just a number (e.g., "386")
    const identifierMatch = search?.match(/^[A-Z]+-(\d+)$/i);
    const numberOnlyMatch = search?.match(/^(\d+)$/);

    // Determine if we should search by number
    const searchNumber = identifierMatch
      ? parseInt(identifierMatch[1], 10)
      : numberOnlyMatch
        ? parseInt(numberOnlyMatch[1], 10)
        : null;

    const issues = await client.issues({
      first: 50,
      ...(search && {
        filter: searchNumber !== null
          ? { number: { eq: searchNumber } }
          : { title: { containsIgnoreCase: search } },
      }),
    });

    const results = await Promise.all(
      issues.nodes.map(async (issue) => {
        const state = await issue.state;
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: state ? {
            name: state.name,
            color: state.color,
          } : {
            name: "Unknown",
            color: "#888",
          },
          priority: issue.priority,
        };
      })
    );

    return results;
  } catch (error) {
    console.error("Failed to fetch Linear issues:", error);
    return [];
  }
}

export interface CreateAttachmentInput {
  issueId: string;
  title: string;
  url: string;
  subtitle?: string;
}

export async function createIssueAttachment(input: CreateAttachmentInput): Promise<boolean> {
  try {
    console.log("[Linear] Getting client for attachment creation...");
    const client = await getLinearClient();
    // The Linear SDK uses attachmentLinkURL for creating URL attachments
    // It takes issueId and url as positional args, with optional title
    const title = input.subtitle ? `${input.title} - ${input.subtitle}` : input.title;
    console.log("[Linear] Creating attachment:", { issueId: input.issueId, url: input.url, title });
    const result = await client.attachmentLinkURL(input.issueId, input.url, {
      title,
    });
    console.log("[Linear] Attachment creation result:", result.success);
    if (!result.success) {
      console.error("[Linear] Attachment creation returned success=false");
    }
    return result.success;
  } catch (error) {
    if (error instanceof LinearAuthError) {
      console.error("[Linear] Auth error creating attachment:", error.message);
    } else if (error instanceof Error) {
      console.error("[Linear] Failed to create attachment:", error.message, error.stack);
    } else {
      console.error("[Linear] Failed to create attachment (unknown error):", error);
    }
    return false;
  }
}

export async function deleteAttachmentByUrl(url: string): Promise<boolean> {
  try {
    const client = await getLinearClient();
    // Find attachments matching this URL
    const attachments = await client.attachmentsForURL(url);

    if (attachments.nodes.length === 0) {
      return true; // No attachment to delete
    }

    // Delete all matching attachments
    for (const attachment of attachments.nodes) {
      await client.deleteAttachment(attachment.id);
    }

    return true;
  } catch (error) {
    console.error("Failed to delete Linear attachment:", error);
    return false;
  }
}

export interface CreateCommentInput {
  issueId: string;
  body: string;
}

export async function createIssueComment(input: CreateCommentInput): Promise<boolean> {
  try {
    const client = await getLinearClient();
    const result = await client.createComment({
      issueId: input.issueId,
      body: input.body,
    });
    return result.success;
  } catch (error) {
    console.error("Failed to create Linear comment:", error);
    return false;
  }
}

export async function getReleaseLabels(): Promise<LinearLabel[]> {
  try {
    const client = await getLinearClient();

    // Query for labels whose parent is named "Release"
    // This works for both workspace-level and team-level label groups
    const children = await client.issueLabels({
      first: 250,
      filter: { parent: { name: { eq: "Release" } } },
    });

    // Deduplicate by label ID (in case of overlapping results)
    const seen = new Set<string>();
    return children.nodes
      .filter((l) => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      })
      .map((l) => ({
        id: l.id,
        name: l.name,
      }));
  } catch (error) {
    if (error instanceof LinearAuthError) throw error;
    console.error("Failed to fetch Linear release labels:", error);
    return [];
  }
}

export async function getIssuesByLabel(labelId: string): Promise<LinearIssue[]> {
  // Validate that labelId is a valid UUID before making the API call
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(labelId)) {
    console.warn(`Invalid labelId format (not a UUID): ${labelId}`);
    return [];
  }

  try {
    const client = await getLinearClient();

    const issues = await client.issues({
      first: 100,
      filter: {
        labels: { some: { id: { eq: labelId } } },
      },
    });

    const results = await Promise.all(
      issues.nodes.map(async (issue) => {
        const state = await issue.state;
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: state
            ? { name: state.name, color: state.color }
            : { name: "Unknown", color: "#888" },
          priority: issue.priority,
        };
      })
    );

    return results;
  } catch (error) {
    if (error instanceof LinearAuthError) throw error;
    console.error("Failed to fetch issues by label:", error);
    return [];
  }
}
