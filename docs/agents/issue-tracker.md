# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `docs/issues/`.

## Conventions

- Issues are numbered sequentially: `docs/issues/<NNN>-<slug>.md`
- Each issue has a title, type, acceptance criteria, and implementation notes
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `docs/issues/` with the next sequential number.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
