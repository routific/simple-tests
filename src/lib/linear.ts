import { LinearClient } from "@linear/sdk";
import { auth } from "./auth";

export async function getLinearClient() {
  const session = await auth();
  if (!session?.accessToken) {
    throw new Error("No Linear access token found");
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

    const issues = await client.issues({
      first: 50,
      ...(search && {
        filter: {
          title: { containsIgnoreCase: search },
        },
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
    const client = await getLinearClient();
    // The Linear SDK uses attachmentLinkURL for creating URL attachments
    // It takes issueId and url as positional args, with optional title
    const result = await client.attachmentLinkURL(input.issueId, input.url, {
      title: input.subtitle ? `${input.title} - ${input.subtitle}` : input.title,
    });
    return result.success;
  } catch (error) {
    console.error("Failed to create Linear attachment:", error);
    return false;
  }
}
