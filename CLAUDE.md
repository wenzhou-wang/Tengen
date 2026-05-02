# Tengen — Claude Working Notes

## Project

Tengen is a monorepo for a web-playable Go/weiqi system. The current shape and
the plan for AI integration are tracked in:

- `README.md` — current features and how to run.
- `docs/AI_ROADMAP.md` — milestones M0 through M7, target architecture, and the
  shared `AiPlayer` contract.
- `docs/RELEASE_NOTES.md` — append-only progress log keyed to roadmap milestones.

When asked about "the plan", "the roadmap", or "what milestone we are on", read
`docs/AI_ROADMAP.md` and `docs/RELEASE_NOTES.md` together. The roadmap is the
target; release notes are the record of what has actually shipped.

## Release notes mechanism

Maintain `docs/RELEASE_NOTES.md` as the single source of truth for milestone
progress. Append a new entry when meaningful progress occurs, specifically:

- A roadmap deliverable is completed.
- A roadmap acceptance criterion is now met.
- A milestone is started, completed, or has its scope changed.
- A user-visible change ships (new bot, new opponent type, new UI surface, new
  server endpoint, new model artifact, new inference target).

Do not write entries for routine refactors, formatting passes, dependency bumps,
or in-progress work that has not yet met an acceptance criterion. Trivial
changes belong in git history, not release notes.

Entry format:

```
## YYYY-MM-DD — <short title>

Milestone: M<n> — <milestone name> (or "Cross-cutting" if it spans milestones)
Status: <started | in progress | deliverable shipped | milestone complete>

- What changed (one to three bullets, user- or contributor-visible).
- Acceptance criteria affected, by milestone (e.g. "M2: server rejects illegal
  moves — met").
- Follow-ups or known gaps, if any.
```

Newest entries go at the top, directly under the heading and intro paragraph.
Use the current date in `YYYY-MM-DD` form. Do not edit or rewrite past entries
once written; if something was wrong, add a correction entry instead.

When you ship work that warrants an entry, write the entry in the same change
that delivers the work. Do not ask permission to update release notes for
qualifying changes — just do it and mention it in your reply.
