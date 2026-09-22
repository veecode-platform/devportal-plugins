# 0006. Adopt the RHDH plugin-program patterns as our reference, by criterion

- **Status**: Accepted (owner decision, 2026-09-17)
- **Date**: 2026-09-17
- **Deciders**: Giovani Corrêa (decision), André Fernandes (ratification)
- **Supersedes**: —
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

The 2026-09-15 discussion around PRs devportal-plugins-parent#2 and devportal-plugins#119
ended in agreement on intent (specialised agents, tasks with sufficient context, an easy
path to create, test and publish a plugin) but not on a design. On 2026-09-17 we read how
Red Hat organises the same problem in `redhat-developer/rhdh-plugins` (`9cb8c794`),
`rhdh` (`b8140abe`), `rhdh-plugin-export-overlays` (`793b432c`), `rhdh-local`
(`11169610`), `rhdh-e2e-test-utils` (`17840dfb`), `rhdh-skill` (`1ea389fa`) and
`backstage/community-plugins` (`936c710a`). The findings are recorded, with pinned links,
in `devportal-planning/research/rhdh-*-2026-09-17.md`.

The upstream already solves the two things we were about to design from scratch: where a
rule lives relative to the code it governs, and how a plugin is developed, proven and
published in four distinct steps. Copying it blindly would also import things built for
twenty-plus teams and for Red Hat's own infrastructure.

## Decision

1. The RHDH plugin ecosystem is the **reference architecture** for this program. Each
   piece is classified before adoption:
   - **Adopt** when the piece is about where a rule lives or how an agent finds it, or when
     it is tooling that runs without infrastructure we do not have.
   - **Adapt** when it assumes Red Hat infrastructure (OpenShift, Prow, Jira, Vertex AI,
     fullsend).
   - **Skip** when it is process for twenty-plus teams (support tiers, per-workspace
     CODEOWNERS, the fullsend agent chain).
2. The criterion is written once, in `devportal-plugins/CONTRIBUTING.md`, so the
   adopt/adapt/skip question is not reopened piece by piece.
3. The fourteen principles adopted under this criterion are recorded as ADRs 0007–0012
   (plugins program) and `devportal-planning` ADR-012–014 (platform side). One deliberate
   deviation from upstream is recorded as such (ADR-0010, publishing only through the
   export overlays).

## Consequences

- **Positive**: the program stops inventing structure; disagreements become "which
  class is this piece in" instead of "what should we build".
- **Negative / trade-offs**: some upstream conveniences (fullsend, `e2e-test-utils`
  deployments, Prow-triggered nightlies) are consciously left out; we accept slower
  feedback in exchange for no new infrastructure.
- **Follow-ups**: staged action plan (kept in this repo under `docs/planning/`), written
  after the ADRs; each stage names the principles it implements.

## Alternatives considered

- **Design our own layout and flow** — the 2026-09-15 conversation showed we would spend
  weeks re-deriving what upstream already runs at scale.
- **Copy upstream wholesale** — imports fullsend, OpenShift-bound E2E and multi-team
  governance that a two-person team cannot operate.
