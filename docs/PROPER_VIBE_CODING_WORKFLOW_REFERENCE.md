# Proper Vibe Coding Workflow

## Purpose

This document defines a disciplined workflow for building software with AI coding agents such as Cline, OpenCode, Codex, Claude Code, Cursor, and similar tools.

The core principle is:

> Good vibe coding is not telling AI to build everything. It is managing an AI software engineer with clear requirements, controlled scope, checkpoints, tests, and verification.

Four sequencing rules are especially important:

1. **Make progress visible early.** If the product has a frontend, establish a small, navigable skeletal UI and deploy it to a preview/staging URL near the beginning of implementation. Do not wait for the backend or final UI design before giving the operator a working URL to inspect.
2. **Build working functionality before final visual polish.** Keep the skeletal UI usable and progressively connect it to real application behavior. Complete and verify the core end-to-end workflows before starting the final visual-design phase.
3. **Make final UI design a human-approved phase.** Use design references and screen mockups/prototypes. The operator must approve the direction before the agent implements the final visual design. The agent must not silently choose a final aesthetic on the operator's behalf.
4. **Finish the actual frontend, not just its main screen.** The final UI phase must cover the applicable navigation, states, responsive behavior, accessibility, documentation and repository links, and production-facing details. Where appropriate, the home-page footer must link to the product documentation and the real GitHub repository.

---

## 1. Start With the Problem, Not the Code

Before opening the coding agent, define:

- What are we building?
- Who is it for?
- What problem does it solve?
- What does the user actually do?
- What does success look like?
- What is explicitly out of scope?

Example:

> Takeover allows someone who cannot attend an appointment to transfer the opportunity to another qualified person without the original organizer having to find a replacement manually.

This is better than:

> Build an appointment marketplace.

The first describes a problem and user outcome. The second leaves too much open to interpretation.

---

## 2. Define the MVP

Separate features into:

### Must Have

The minimum functionality required for the product to work.

### Nice to Have

Useful enhancements that can wait.

### Later

Features that should not distract from the initial build.

Example:

**Must have**
- User registration
- Create appointment
- Mark appointment transferable
- Someone claims it
- Original appointment holder confirms
- Transfer is recorded

**Nice to have**
- AI matching
- Reputation
- Payments
- Notifications
- Calendar integrations

**Later**
- Mobile app
- Advanced recommendation engine
- Advanced analytics

The AI should initially build only the must-have functionality.

---

## 3. Write a Specification Before Implementation

Create a source-of-truth document such as:

```text
PROJECT_SPEC.md
```

Recommended sections:

```text
1. Product overview
2. Users
3. Core user flows
4. Features
5. Business rules
6. Data model
7. Authentication
8. API requirements
9. UI requirements and route inventory
10. Early skeletal frontend and deployment plan
11. End-to-end functionality completion gate
12. Design-reference, mockup, and operator-approval gate
13. Final frontend completeness requirements (including applicable Docs/GitHub footer links)
14. Security requirements
15. Out-of-scope features
16. Acceptance criteria
```

The specification prevents the AI from inventing requirements while coding.

---

## 4. Decide the Architecture

Do not allow the AI to randomly select technologies while implementation is already underway.

Define the stack first.

Example:

```text
Frontend
Next.js
TypeScript
Tailwind

Backend
Next.js API / Node

Database
PostgreSQL

Authentication
Clerk / Supabase Auth

Payments
Stripe

AI
OpenAI API

Deployment
Vercel
```

Tell the agent:

> Do not change the architecture without asking me first.

This prevents architecture drift and unnecessary migrations.

### Decide deployment sequencing before implementation

The implementation plan must establish how the frontend will be deployed early, not only how the completed product will be launched. Choose the hosting and environment strategy during planning. If a frontend exists or is required, the first implementation milestone should produce a navigable skeletal UI and deploy it to a stable preview/staging URL as soon as practical—normally in the first implementation phase.

Keep that URL updated after each accepted phase so the operator can monitor actual UI changes. Do not expose unfinished work as a production release or connect an early preview to real money movement, sensitive production data, or irreversible external actions. Use safe test services and protected preview access where needed. If a frontend does not exist or is not appropriate, document the reason and define the equivalent operator-visible verification path.

---

## 5. Have the AI Understand the Existing Project First

Before implementation, have the agent inspect:

- Repository structure
- package.json
- Existing code
- Environment
- Database schema
- Configuration
- Documentation
- Entry points
- Existing components

A useful instruction is:

> Do not modify anything. Inspect the repository and explain the architecture, existing components, dependencies, entry points, risks, and what needs to change to implement the specification.

This is one of the biggest differences between good and bad AI-assisted development.

---

## 6. Create an Implementation Plan

Do not immediately ask:

> Build the application.

Instead:

> Create an implementation plan based on PROJECT_SPEC.md. Break it into independently testable phases. Do not write code yet.

A better plan for a product with a frontend separates **early visibility**, **end-to-end functionality**, and **final visual design**:

```text
Phase 1 — Repository/platform foundation + skeletal frontend
  ├── inspect the repository and confirm the agreed stack
  ├── establish the app shell, routes, navigation, and basic responsive layout
  ├── create clearly labelled structural placeholders for the main screens
  ├── configure the preview deployment and publish the first usable URL
  └── verify that the deployed page loads and report the URL to the operator

Phase 2 — Backend/data/auth foundation
  ├── database schema and migrations
  ├── authentication and authorization foundation
  └── health checks and safe environment configuration

Phase 3 — Core domain and API behavior
  ├── domain entities and business rules
  ├── API endpoints and validation
  └── unit/integration tests

Phase 4 — Functional UI integration and end-to-end flows
  ├── connect skeletal screens to real APIs and state
  ├── implement the core user journeys and failure states
  └── verify the core workflows end to end on the deployed preview

Phase 5 — Feature completion and pre-design verification
  ├── finish the agreed MVP behavior without adding scope
  ├── resolve functional blockers and run E2E/regression tests
  └── confirm the core product works before visual redesign begins

Phase 6 — Design references, mockups, and operator approval
  ├── collect or agree on references with the operator
  ├── create reference-informed mockups/prototypes for key screens
  ├── show the operator the mockups and document feedback
  └── STOP for explicit approval; do not implement the final visual system yet

Phase 7 — Approved final UI design and implementation
  ├── translate approved mockups into the design system and components
  ├── apply the approved visuals to the already-working functionality
  └── preserve business rules and API contracts unless approved separately

Phase 8 — Frontend completeness and release verification
  ├── cover responsive layouts, accessibility, loading/empty/error/success states
  ├── check navigation, 404/not-found and other applicable product states
  ├── add the real Documentation and GitHub links to the home-page footer when appropriate
  ├── finish required repository/user documentation and remove dead links or inert controls
  └── run full UI/E2E regression tests on the deployed preview

Phase 9 — Production readiness, release, and monitoring
  ├── security and configuration review
  ├── production deployment/approval
  └── smoke-test the production URL and monitor/fix issues
```

Adapt phase granularity to the project, but do not merge away the key gates: early frontend deployment, proven end-to-end functionality, explicit design approval, and final frontend completeness. A phase can be split into smaller tasks; it must not be expanded into an uncontrolled batch.

---

## 7. Build One Phase at a Time

This is one of the most important rules.

Do NOT tell the agent:

> Implement phases 1–6.

Instead:

> Implement Phase 1 only.

Then:

1. Stop.
2. Run tests.
3. Inspect the changes.
4. Fix anything wrong.
5. Commit.
6. Move to the next phase only after verification.

AI coding agents can make large numbers of changes extremely quickly. Small controlled phases reduce the damage when something goes wrong.

---

## 8. Give the AI Explicit Constraints

A reusable instruction set:

```text
Rules:

1. Follow PROJECT_SPEC.md.
2. Do not invent requirements.
3. Do not change the architecture without asking.
4. Do not modify unrelated files.
5. Reuse existing components where possible.
6. Run tests after implementation.
7. Do not proceed to the next phase automatically.
8. If something is ambiguous, stop and explain the ambiguity.
9. Never claim something works without testing it.
10. At the end, provide a summary of files changed and tests run.
11. If the product has a frontend, deploy the skeletal frontend early and report its preview URL; keep the preview updated after each verified phase.
12. Do not postpone all frontend work until the backend is complete. The early UI is structural and functional enough to navigate, not a final visual design.
13. Do not begin final visual design until the core product workflows work end to end and the operator has been shown evidence of that.
14. In the late design phase, use agreed design references to create mockups/prototypes and STOP for explicit operator approval before implementing final visuals.
15. In final frontend completion, include applicable product documentation and the real GitHub repository link in the home-page footer. Never fabricate a URL or expose a private repository without approval.
16. Do not leave dead navigation links, inert buttons, unexplained placeholder copy, or missing loading/empty/error/success states in the final UI. If a link or section is intentionally omitted, record why.
17. Do not proceed past any approval gate without the operator's explicit decision.
```

This changes the agent from an uncontrolled code generator into an engineer operating within a specification.

---

## 9. Use Small, Independently Testable Tasks

Instead of:

> Build authentication.

Break it down.

Example:

```text
Implement email/password registration.

Requirements:
- ...
- ...
- ...

Acceptance criteria:
- ...
- ...
- ...

Do not implement login yet.
Do not modify unrelated functionality.
Run the relevant tests when finished.
STOP after completing this task.
```

Then separately implement:

- Login
- Password reset
- Authorization middleware
- Session handling
- etc.

Small tasks reduce hallucination, unintended changes, and architectural drift.

---

## 10. Make the AI Test Its Own Work

Every meaningful feature should follow:

```text
IMPLEMENT
    ↓
TEST
    ↓
INSPECT
    ↓
FIX
    ↓
COMMIT
```

Do not follow:

```text
IMPLEMENT
    ↓
IMPLEMENT
    ↓
IMPLEMENT
    ↓
IMPLEMENT
    ↓
"Hopefully it works"
```

Useful verification commands may include:

```bash
npm test
npm run build
npm run lint
```

and, depending on the project:

```text
Unit tests
Integration tests
API tests
End-to-end tests
Database tests
```

For UI features, have the agent verify the actual user flow on the deployed preview whenever feasible. Also verify the preview itself: correct build, reachable URL, expected route behavior, no blocking console/runtime errors, and no accidental connection to production-only services.

For the final UI phase, test the approved design across key desktop and mobile widths and verify keyboard navigation, focus visibility, contrast, labels, feedback states, and all footer/navigation links. Confirm that Documentation and GitHub links resolve to the correct, intended destinations when they are applicable.

---

## 11. Do Not Trust "It Works"

If the agent says:

> Authentication is now working.

Ask it to prove it.

A better instruction:

> Run the relevant tests and verify the complete registration → login → dashboard flow. Report the actual test results. Do not claim success without evidence.

Core principle:

> Evidence > AI's claim.

---

## 12. Use Git Aggressively

Create small, meaningful commits.

Good examples:

```text
feat: add authentication
feat: add appointment creation
feat: add transfer claims
fix: prevent duplicate claims
test: add transfer flow tests
```

Avoid giant unclear commits such as:

```text
BIG UPDATE FINAL FINAL 2
```

Git is the safety net that allows you to roll back bad AI changes.

---

## 13. Create Checkpoints

For serious projects:

```text
CHECKPOINT 1
    ↓
VERIFY
    ↓
COMMIT
    ↓
CHECKPOINT 2
    ↓
VERIFY
    ↓
COMMIT
```

At each checkpoint, record:

```text
Current phase:
Completed:
Tests and evidence:
Preview/staging URL and deployed commit:
Frontend status (skeletal / functionally integrated / design pending approval / final UI complete):
Design references/mockups and operator approval status:
Documentation and footer-link status:
Known issues:
Next task:
Blocked by:
```

This is particularly useful when:

- The AI session ends.
- Model quota runs out.
- Switching between Cline, OpenCode, Codex, or another agent.
- Returning to the project after a break.
- Handing the project to another developer/agent.

---

## 14. Maintain an AI Handoff File

For larger projects, maintain:

```text
AGENTS.md
```

and/or:

```text
AI_HANDOFF.md
```

Recommended information:

```text
PROJECT
Current architecture
Important decisions
Current phase and phase acceptance criteria
Completed work
Preview/staging URL and latest deployed commit
Frontend status and known UI limitations
Design references/mockups and whether the operator approved them
Documentation status and Docs/GitHub footer-link destinations
Known bugs
Commands
Environment and deployment safety notes
Important files
Things NOT to change
Next task
```

This gives a new AI session enough context to continue without repeatedly explaining the project.

---

## 15. Separate Product Decisions From Implementation Decisions

The human should control product decisions.

Example:

**Human/product decision:**

> Users should be able to transfer appointments.

**AI/implementation decision:**

> Implement this using a Transfer table with a unique constraint.

The human should retain control over:

- Product requirements
- Architecture
- Security model
- Data ownership
- Business rules
- Scope
- Acceptance criteria

The AI should primarily accelerate implementation.

---

## 16. Perform AI Code Reviews

After a major feature, ask:

> Review everything you just implemented as a senior engineer. Look specifically for security vulnerabilities, race conditions, incorrect assumptions, edge cases, broken business logic, unnecessary complexity, and missing tests. Do not modify anything yet. Report findings first.

Then decide what should be fixed.

This is much better than asking:

> Is the code good?

---

## 17. Perform a Dedicated Security Pass

Before production release, explicitly review the items below. Early preview deployments still require safe secret handling, access control, and test-mode integrations; an early deployment is not permission to expose production data or perform real transactions.

```text
AUTHENTICATION
AUTHORIZATION
INPUT VALIDATION
RATE LIMITING
SECRET HANDLING
SQL INJECTION
XSS
CSRF
IDOR
PRIVILEGE ESCALATION
RACE CONDITIONS
PAYMENT SECURITY
WEBHOOK SECURITY
API SECURITY
```

A particularly useful approach is to ask the AI to act as an attacker:

> Assume you are a malicious user. Try to claim another user's appointment, manipulate IDs, bypass authorization, replay requests, submit malformed input, and exploit race conditions. Do not fix anything yet. Report vulnerabilities.

This encourages adversarial testing instead of simply asking the AI to praise its own implementation.

---

## 18. Keep the Frontend Visible Early, Then Design It Properly

These are separate responsibilities and must not be collapsed into one late “UI phase.”

### A. Early skeletal frontend and continuous preview deployment

When a frontend is part of the product:

- Build a small but navigable shell at the start: global layout, basic branding placeholder, primary navigation, the agreed routes, and structural placeholders for key screens.
- Include enough real layout and route handling to reveal routing, build, responsive-layout, and deployment problems early. It may use plain, temporary styling; it must not pretend unfinished features are functional.
- Deploy this shell to a stable preview/staging URL as soon as it runs. Report the exact URL, what is present, what is intentionally incomplete, and the latest deployed commit.
- Keep the same preview updated after every verified phase. At checkpoints, the operator should be able to inspect the deployed interface rather than rely only on screenshots or an agent's description.
- Use safe development configuration, test data, and sandbox integrations. Protect the preview when the app is sensitive. Do not enable real payments, destructive actions, or production data merely to make the preview appear complete.
- If deployment is blocked, report the exact blocker and complete the safest local verification possible; do not claim it is deployed.

### B. Functionality gate before final visual design

The operator should be able to see progressive UI changes throughout implementation, but final visual design must wait until the agreed MVP functionality is implemented and the important user journeys have passed end-to-end verification. Use a simple consistent temporary UI while integrating the frontend with real backend behavior. Do not spend time polishing a screen whose underlying workflow is still broken or undefined.

Before entering the design phase, provide evidence for the critical flows: tests run, results, the deployed preview URL, known limitations, and any remaining functional blockers. Resolve blocking failures first or explicitly obtain the operator's decision on any accepted exception.

### C. Design references → mockups/prototypes → operator approval

1. Ask the operator to supply or approve one or more design references (URLs, screenshots, images, existing products, or written direction). If they are not supplied, suggest reference candidates for the operator to choose; do not silently treat an AI-generated aesthetic as approved.
2. Record what should be borrowed from each reference—such as layout, hierarchy, density, interaction patterns, typography mood, or color treatment—and what must remain original or product-specific.
3. Produce mockups/prototypes for the main screens and important states using the agreed references. Show enough of the experience to judge navigation, hierarchy, and responsive behavior, not only an isolated hero section.
4. Present the mockups clearly and collect operator feedback. Revise them until the operator explicitly approves the direction.
5. **Approval gate:** do not implement the final visual system before approval. After approval, record the accepted reference links/assets, decisions, required screens, and known deviations in the project documentation/handoff.
6. Implement the approved design on top of the working functionality. Do not change business logic, APIs, or architecture merely to match a visual reference.

### D. Final frontend and documentation completeness

During final UI implementation and release verification, confirm the applicable items below rather than treating the homepage as the whole frontend:

- All agreed routes/screens, global navigation, footer, and responsive layouts are present.
- Every interactive control has a working, intentional action; no dead buttons, `href="#"` placeholders, or broken navigation remain.
- Loading, empty, validation, success, error, permission-denied, not-found, and other relevant states are implemented.
- Accessibility basics are covered: semantic structure, labels, keyboard access, visible focus, meaningful contrast, and useful error feedback.
- Product-facing details are complete where applicable: page titles/metadata, favicon/app icon, social sharing metadata, 404/not-found experience, sitemap/robots rules, and relevant privacy/terms/support/contact links. Do not add unnecessary legal, analytics, cookie-consent, or tracking machinery when it is not needed.
- Project documentation exists in the repository. Include a useful `README.md` and relevant `docs/` content such as setup, environment variables, architecture, user/operator guidance, deployment, and troubleshooting as the project warrants.
- For projects with a frontend, the home-page footer should include a **Documentation** link and a **GitHub** repository link when appropriate. The Documentation link must lead to an actual, reachable documentation destination—for example, a real in-app `/docs` page, a published documentation site, or (where appropriate) the relevant documentation page in the public repository. Do not point to a local file path that users cannot open. The GitHub link must lead to the actual repository. Never invent or guess URLs. If the code repository must remain private or a public link would be inappropriate for the product, document that reason and ask the operator before omitting or replacing the link.
- All links are checked on the deployed preview, and the final production URL is smoke-tested after release.

The design/feature checklist must state which items apply, which are intentionally omitted, and why. “When applicable” is not permission to skip a requirement silently.

---

# The Complete Vibe-Coding Loop

```text
                 IDEA
                   ↓
              SPECIFICATION
                   ↓
                 MVP
                   ↓
              ARCHITECTURE
                   ↓
             REPOSITORY REVIEW
                   ↓
          IMPLEMENTATION PLAN
                   ↓
      SKELETAL FRONTEND + PREVIEW DEPLOY
                   ↓
        BACKEND / CORE FUNCTIONALITY
                   ↓
       INTEGRATE AND VERIFY END-TO-END
                   ↓
          FUNCTIONALITY ACCEPTANCE GATE
                   ↓
       DESIGN REFERENCES + MOCKUPS
                   ↓
         OPERATOR APPROVAL GATE
                   ↓
        IMPLEMENT APPROVED FINAL UI
                   ↓
    DOCS / FOOTER / RESPONSIVE / ACCESSIBILITY
                   ↓
           SECURITY + E2E AUDIT
                   ↓
          PRODUCTION RELEASE
                   ↓
             MONITOR / FIX

For every implementation phase:
IMPLEMENT ONE SMALL TASK → TEST → REVIEW → FIX → COMMIT → CHECKPOINT → STOP
```

---

# The Golden Rule

> Never let the AI's ability to generate code determine the size of the task.

AI can generate thousands of lines of code very quickly.

That does not mean you should ask it to.

Your job is to maintain:

- Direction
- Scope
- Product intent
- Architecture
- Security requirements
- Acceptance criteria
- Verification

The AI's job is to accelerate:

- Implementation
- Testing
- Debugging
- Refactoring
- Documentation

---

# Recommended Structure for Serious Projects

For substantial builds, use:

```text
PROJECT/
│
├── PROJECT_SPEC.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── AGENTS.md
├── AI_HANDOFF.md
├── README.md
│
├── src/
├── tests/
├── docs/                 # Setup, user/operator guide, architecture, deployment, troubleshooting
└── ...
```

### PROJECT_SPEC.md

The product source of truth.

### ARCHITECTURE.md

The technical architecture and important technical decisions.

### IMPLEMENTATION_PLAN.md

The phased build plan.

### AGENTS.md

Persistent instructions and rules for AI coding agents.

### AI_HANDOFF.md

Current state, completed work, known issues, the deployed preview URL, the status of design approval, and the exact next step.

### README.md and docs/

Give developers and operators enough information to install, configure, test, deploy, and troubleshoot the project. Add user-facing product documentation when the product needs it. When a frontend is included, expose the real documentation destination and the actual GitHub repository from the home-page footer when appropriate; make any exception explicit and operator-approved.

---

# Recommended Operating Model

For future builds, use this division of responsibility:

```text
YOU
↓
Product architect / technical decision maker

AI AGENT
↓
Senior implementation engineer

PROJECT_SPEC.md
↓
Source of truth

AGENTS.md
↓
Persistent AI rules

AI_HANDOFF.md
↓
Continuity / session memory

GIT
↓
Safety net

TESTS
↓
Truth

CHECKPOINTS
↓
Control
```

The objective is not simply to "code with AI."

The objective is to create a repeatable system where AI can build quickly **without losing control of the software.**
