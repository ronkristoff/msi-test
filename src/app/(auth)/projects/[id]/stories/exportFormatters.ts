export type StoryExport = {
  _id: string;
  title: string;
  user_story: { as_a: string; i_want: string; so_that: string };
  acceptance_criteria: string[];
  affected_components: { modules: string[]; apis: string[]; data_models: string[] };
  technical_context?: string;
  status: string;
  generated_at: number;
  thread_id: string;
};

export function slugifyStoryTitle(title: string, fallbackId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    return `story-${fallbackId.slice(0, 8)}`;
  }
  return slug;
}

function listOrPlaceholder(values: string[], placeholder: string): string {
  const filtered = values.filter(Boolean);
  return filtered.length === 0 ? placeholder : filtered.join(", ");
}

function acceptanceCriteriaSection(
  ac: string[],
  heading: "##" | "###" = "###",
): string {
  const filtered = ac.filter(Boolean);
  if (filtered.length === 0) {
    return `${heading} Acceptance Criteria\n\n_No acceptance criteria._`;
  }
  const items = filtered.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `${heading} Acceptance Criteria\n\n${items}`;
}

export function buildStoryMarkdown(story: StoryExport): string {
  const lines: string[] = [];
  lines.push(`## ${story.title}`);
  lines.push("");
  lines.push(`**As a** ${story.user_story.as_a}`);
  lines.push(`**I want** ${story.user_story.i_want}`);
  lines.push(`**So that** ${story.user_story.so_that}`);
  lines.push("");
  lines.push(acceptanceCriteriaSection(story.acceptance_criteria));
  lines.push("");
  lines.push("### Affected Components");
  lines.push("");
  lines.push(
    `- **Modules:** ${listOrPlaceholder(story.affected_components.modules, "None identified")}`,
  );
  lines.push(
    `- **APIs:** ${listOrPlaceholder(story.affected_components.apis, "None identified")}`,
  );
  lines.push(
    `- **Data Models:** ${listOrPlaceholder(story.affected_components.data_models, "None identified")}`,
  );
  if (story.technical_context) {
    lines.push("");
    lines.push("### Technical Context");
    lines.push("");
    lines.push(story.technical_context);
  }
  return lines.join("\n");
}

export function buildStoriesMarkdown(stories: StoryExport[]): string {
  if (stories.length === 0) {
    return "# User Stories Export\n\n_No stories selected.";
  }
  const iso = new Date().toISOString();
  const count = stories.length;
  const noun = count === 1 ? "story" : "stories";
  const header = `# User Stories Export\n\n_${count} ${noun} · Exported ${iso}_`;
  const body = stories.map(buildStoryMarkdown).join("\n\n---\n\n");
  return `${header}\n\n${body}`;
}

export function buildBmadStoryMarkdown(
  story: StoryExport,
  projectName: string,
): string {
  const iso = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Story: ${story.title}`);
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`Generated ${iso} from project "${projectName}".`);
  if (story.technical_context) {
    lines.push("");
    lines.push(`**Technical context:** ${story.technical_context}`);
  }
  lines.push("");
  lines.push("## Story");
  lines.push("");
  lines.push(`As a ${story.user_story.as_a},`);
  lines.push(`I want ${story.user_story.i_want},`);
  lines.push(`so that ${story.user_story.so_that}.`);
  lines.push("");
  lines.push(acceptanceCriteriaSection(story.acceptance_criteria, "##"));
  lines.push("");
  lines.push("## Affected Components");
  lines.push("");
  lines.push(
    `- **Modules:** ${listOrPlaceholder(story.affected_components.modules, "None")}`,
  );
  lines.push(
    `- **APIs:** ${listOrPlaceholder(story.affected_components.apis, "None")}`,
  );
  lines.push(
    `- **Data Models:** ${listOrPlaceholder(story.affected_components.data_models, "None")}`,
  );
  return lines.join("\n");
}
