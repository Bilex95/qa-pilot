# QA Pilot: Product Audit and Roadmap to Stand Out

27 November 2026 · Prepared for Tobi (Bilex95)

## The verdict

QA Pilot is an excellent engineering foundation that does not yet look or feel like a product a company would pay for. The build quality is real: 63 of 63 requirements verified, tenant isolation tested on every endpoint, and 16 CI jobs guarding every change. What it lacks is what a buyer notices in the first ten minutes: an obvious AI experience, serious admin controls, reports a manager can forward, guidance, integrations, and a visual identity with energy.

The three moves that matter most:

1. **Make AI the front door.** Today AI hides behind buttons on four screens. Give it a home, a command bar and a visible presence everywhere.
2. **Make it fit inside a company.** Full admin settings, plus integrations: GitHub, Jira, Slack, CI test results, webhooks and API keys.
3. **Make quality visible.** A written, shareable QA report for every release and run, a richer dashboard, and a sharper, more vibrant look.

## Through the eyes of top tech leaders

Each would respect the engineering and then push hard on the same thing: the product has to do more of the work and prove its value faster. These are lenses based on how each leader is publicly known to judge products, not their words.

| Lens | What they would praise | What they would push on |
| --- | --- | --- |
| Elon Musk: first principles, speed | Fast pages (bug list 45 ms at 20,000 bugs), clean scope | Why does a person still fill most fields? Delete steps. AI should do the task, with the person approving, not offering hints |
| Jeff Bezos: customer obsession, working backwards | Full traceability from requirement to test | Who is the customer, and what is the one page they forward to their boss? Day one setup in under five minutes |
| Jensen Huang: platforms and scale | Solid architecture and performance testing | Where is the platform? A public API, webhooks, an ecosystem other tools build on, and AI at the core rather than the edge |
| Mark Zuckerberg: growth loops, shipping fast | Invites and multi workspace support | Where is the activation funnel? Product analytics, real time collaboration, notifications that bring people back |
| Dario Amodei: safety, trust, honest AI | AI is suggestion only, prompt injection is tested, usage is logged | The live model has never been tested. Add evaluations, show why the AI said what it said, and state plainly what data is sent |
| Sam Altman: AI native products | Five useful AI features already exist | Make it agentic: one place to ask anything, agents that run test passes, and an MCP server so other AI tools can use QA Pilot |

## What is already strong

Keep these as they are while the product grows around them.

- **Trustworthy core:** roles enforced on the server, tenant isolation tested per endpoint, argon2id passwords, secure headers, no open CodeQL alerts.
- **Complete QA loop:** bugs, board, suites, cases, runs, one click bug from a failed step, releases with readiness rules.
- **Responsible AI design:** every AI output is a suggestion, prompt text is never stored, daily limits and an off switch exist.
- **Real quality engineering:** pytest, Newman, layout checks at 12 widths, accessibility checks, parity screenshots, all in CI.
- **Speed:** p95 under 50 ms for the bug list even at 20,000 bugs.

Most competitors cannot claim this level of testing on their own product. That is a story worth telling buyers.

## Findings: the gaps

Nine gaps stand between a working tool and a product that stands out.

| Area | What I found | Why it matters |
| --- | --- | --- |
| Settings | Four tabs only: Organization (name, AI on or off, daily AI limit), Labels, Audit log, My profile. A QA Engineer such as Priya sees only My profile. Even an Org Admin has no workflow, field, notification, security, integration or data controls | Admins judge a tool by its settings. Thin settings read as a toy |
| AI visibility | AI lives as buttons inside New bug, the bug page, the case editor and the release page. There is no AI home, no chat, no command bar. Only admins see "AI usage" in the menu | The headline feature is invisible. A buyer can use the app and never notice it is AI powered |
| Reporting | A dashboard, a Reports page and CSV export. No written narrative, no PDF, no share link, no scheduled report, no report per test run | Managers and clients want a document they can read and forward, not charts to interpret |
| Guidance | No product tour, no help centre, no explanation of how QA Pilot fits a company's process or tests other software | People who do not understand a tool in the first session leave |
| Integrations | None: no Jira, GitHub, Slack, CI results import, webhooks or public API keys (all were out of scope for v1) | Companies will not adopt a QA tool that sits outside their existing systems |
| Bug capture | Bugs are typed in by hand. No screenshot annotation, screen recording, console or network capture | Capture is where testers lose the most time, and it is Jam's whole business |
| Testing depth | Manual runs only. No automated results, exploratory sessions, test plans, milestones, requirement coverage or flaky test detection | Modern teams mix manual and automated testing in one view |
| Visual design | Muted palette, little motion, calm but flat. It reads as an internal tool | First impressions decide demos and portfolio reviews |
| Platform readiness | Live AI never tested, no general rate limit, no email or in app notifications, no real time updates, no deployment, no SSO | Needed before real customers, and expected by enterprise buyers |

## The competition: what to take and where they are weak

No single competitor covers capture, triage, testing and release reporting with AI that is included rather than sold as extra credits. That gap is QA Pilot's opening.

| Product | What it does best (take this) | Where it is weak (beat this) |
| --- | --- | --- |
| [TestRail](https://www.g2.com/compare/zephyr-scale-vs-qase-vs-tuskr-vs-testrail) | Enterprise standard for organising suites, cases and runs, deep Jira link | G2 reviewers cite slow performance and slow loading; reporting feels limited out of the box; AI features described as basic |
| [Qase](https://www.qase.io/ai-software-testing/) | Clean interface; AI generates test cases from Jira, GitHub or plain text and runs them once to confirm they pass | Reviewers list limited features and poor reporting; AI runs on a shared credit pool that can run out |
| [BrowserStack Test Management](https://www.browserstack.com/docs/test-management/browserstack-ai/ask-ai) | An "Ask AI" chat panel on every page that runs agents in order and asks approval before saving | AI test case generation only on the top Team Ultimate plan; pricing complexity |
| [Testmo](https://laravel-news.com/testmo-review-unified-test-management) | Manual cases, exploratory sessions and CI automation results in one place | Little native AI |
| [Jam](https://jam.dev/docs/~gitbook/pdf) | One click bug capture with replay, console logs, network requests and device info | Capture only: no test management, runs or releases |
| [Linear](https://www.g2.com/products/linear/reviews/linear-review-11207982) | Speed, keyboard first design, Triage Intelligence and agents that act when an issue arrives | Reviewers cite limited customisation and analytics; deeper reporting sits on the Business plan |
| [AI testing agents](https://qa.tech/blog/best-agentic-qa-tools-in-2026) (QA Wolf, Momentic, testRigor, QA.tech) | Agents that write, run and heal end to end tests | They run tests but do not own the bug, triage and release story |

What to take: BrowserStack's Ask AI panel, Jam's capture, Testmo's unified results, Qase's generate then verify, Linear's speed and triage automation. What to beat: slow and dated (TestRail), weak reporting (Qase, TestRail, Linear), AI behind paywalls (Qase, BrowserStack).

## How QA Pilot stands out

**Positioning:** the AI QA lead for growing software teams. It captures the bug, triages it, writes the tests, runs the release check and writes the report, with every AI step explained and approved by a person.

**Who it is for:** everyone from freelance QA testers and creators to small agencies, startup product teams and enterprise QA, each with a plan that fits. The first push goes to small agencies and startup teams, who feel the tool sprawl most and decide fast.

Five differentiators to build towards:

1. **AI included, not metered.** Every plan gets the AI features, with clear daily limits instead of credits that run out mid sprint.
2. **One loop, one tool.** Capture (like Jam), test management (like Qase and Testmo) and release decisions in the same place, so nothing is copied between tools.
3. **Reports a CEO can read.** A written release report in plain language, with evidence linked, that goes out as a PDF or a share link.
4. **Explainable AI.** Every suggestion shows why, what it looked at, and its confidence. Few competitors make this visible.
5. **Open by default.** Public API, webhooks and an MCP server, so Claude, Cursor or a CI pipeline can file bugs and read results directly.

## Settings blueprint

Settings should grow from 4 tabs to 12 areas, grouped into Workspace, Work, Connections and Personal. Each area shows only to the roles that can change it, and the API keeps refusing what a role may not do.

| Group | Area | Who sees it | What goes inside |
| --- | --- | --- | --- |
| Workspace | General | Org Admin | Name, logo, brand colour, time zone, date format, default language |
| Workspace | Members and roles | Org Admin | Invite, deactivate, transfer ownership, custom roles with a permission grid |
| Workspace | Security | Org Admin | Two factor sign in requirement, session length, password policy, allowed email domains, SSO later |
| Workspace | Audit log | Org Admin | Already exists; add filters and export |
| Workspace | Plan and usage | Org Admin | Seats, AI usage against limits, storage used, invoices later |
| Work | Workflow | Org Admin, QA Lead | Bug statuses and transitions, who may move what, required fields per status |
| Work | Fields and templates | Org Admin, QA Lead | Custom fields, labels (exists), bug and test case templates, severity and priority scales |
| Work | SLAs and quality rules | Org Admin, QA Lead | SLA hours per severity, release readiness thresholds, auto reopen rules |
| Work | AI | Org Admin | Per feature switches, daily limits (exists), tone and language of AI output, data sent to the model, auto apply rules, AI options (MCP and your own API key) |
| Connections | Integrations | Org Admin | GitHub, GitLab, Jira, Slack, Teams, CI results import, webhooks |
| Connections | API keys | Org Admin | Create, scope, rotate and revoke keys, with last used time |
| Personal | Profile, notifications, appearance | Everyone | Profile and password (exist), two factor sign in, email and in app notification choices, light or dark theme, keyboard shortcuts |

A Data area (import from TestRail, Qase, Jira or CSV, export everything, retention period, delete workspace) can sit under Workspace once imports exist.

## Reporting, AI and guidance blueprint

### The written QA report

One click on a release or a test run produces a report that reads like a QA lead wrote it. AI drafts it from real data, a person edits and approves it, and it exports as PDF or a share link.

1. **Verdict:** ship, ship with risks, or do not ship, with the reason in two sentences.
2. **Scope tested:** suites, cases, environments, browsers and devices, who tested and when.
3. **Results:** pass, fail, blocked and skipped counts, pass rate against the last release.
4. **Every issue found:** each bug with severity, status, steps, screenshot and owner, open ones first.
5. **Risks and gaps:** untested areas, flaky tests, SLA breaches, reopened bugs.
6. **Recommendations:** what to fix before release and what can wait.
7. **Evidence appendix:** links to each run, case and bug.

Reports can also be scheduled weekly by email or Slack.

### A richer dashboard

Add defect trends by component, mean time to fix, reopen rate, test coverage by requirement, flaky tests, release readiness history, and a personal "My work" view. Each chart opens the underlying list.

### The AI front door

- An **Ask QA Pilot** panel opened from a bright AI icon fixed in the top bar of every page (or Ctrl+K), like BrowserStack's Ask AI. People chat with it, give it instructions, and use its Setup tab to choose or connect an AI provider. Examples: "summarise open critical bugs", "write tests for this story", "why is this release blocked?"
- An **AI home** showing what AI did this week, suggestions waiting for approval, and time saved.
- A visible AI mark on every AI action, with "why" and confidence on every suggestion.

### Guidance

- A first run tour per role, and a sample project that teaches by doing.
- A **Guide centre** inside the app: how QA Pilot works, how to test a web app with it from plan to report, and how to connect it to GitHub, Jira, Slack and CI.
- Helpful empty states that explain each screen and offer the next step.

## Bring your own AI, and live AI for free

A workspace can choose its own AI in Settings, and QA Pilot can run live AI without buying API credit. One honest limit: a Claude Pro or Max plan cannot power another app directly, because it is [separate from Anthropic API credits](https://zed.dev/docs/ai/use-an-existing-subscription.html).

**Decided: two ways to use your own AI, plus a free default.**

| Option in Settings, AI | How it works | Cost to the user |
| --- | --- | --- |
| 1. QA Pilot as an MCP server | QA Pilot publishes an MCP server that Claude, ChatGPT or any other MCP capable AI can connect to. The person's own subscription does the thinking; QA Pilot supplies bugs, tests, runs and reports, and records what the AI changed | Their existing AI subscription |
| 2. Bring your own API key | Paste a key for Anthropic, OpenAI, Google Gemini or any OpenAI compatible provider. Stored encrypted, never shown again, usable only by that workspace | Billed by their provider |
| Default: QA Pilot's AI | Runs on a free provider (Gemini free tier first, Groq or OpenRouter as fallback) for the demo, with daily limits | Free |

**Live AI without paying:** [Google's Gemini free tier](https://ai.google.dev/gemini-api/docs/pricing) charges nothing for input or output, and [Groq and OpenRouter also offer free API access with no card](https://pricepertoken.com/free-ai-api). [OpenAI and Anthropic have no free API tier](https://decodethefuture.org/?p=4494). Two cautions: Google may use free tier data to improve its products, so use seed data only; and free limits change often, so check them in each console.

The build is simpler than it looks. The provider interface already exists, so one OpenAI compatible adapter covers OpenAI, Groq and OpenRouter, plus one adapter for Gemini. Keys are stored encrypted per workspace and never shown again.

## Pricing page

The plans take their names from flying, to match the QA Pilot name: from a solo flight to mission control. Prices are suggestions to keep QA Pilot well under [TestRail, which starts at $39 per user a month](https://www.g2.com/compare/zephyr-scale-vs-qase-vs-tuskr-vs-testrail), and near [Jam's $10 Team plan](https://g2.com/products/jam-dev/reviews).

| Plan | Built for | Suggested price | What it includes |
| --- | --- | --- | --- |
| Solo Flight | Freelance QA testers and creators | Free forever | 1 workspace, up to 3 members, unlimited bugs and tests, AI with your own key, a free provider or a daily built in allowance, basic reports |
| Co-Pilot | Small agencies and startup teams | $8 per member a month | Everything in Solo Flight, unlimited members, the written QA report with PDF and share links, GitHub and Slack, client share pages |
| Flight Crew | Growing product teams | $16 per member a month | Everything in Co-Pilot, CI results import, Jira, custom workflow and fields, scheduled reports, higher AI limits |
| Mission Control | Enterprise QA | Talk to us | Everything in Flight Crew, SSO, custom roles, audit export, your own cloud AI, data retention controls, priority support |

The page also offers annual billing at two months free, and could add regional pricing for emerging markets later. Until there is a business behind it, the paid buttons say "Join the waitlist", so no payment provider is needed and nothing costs you money.

## Visual refresh direction

The new look should feel confident, fast and alive while keeping the WCAG AA contrast the app already passes. Lock it as a new design prototype before any code changes, exactly as Stage 2 did.

| Element | Today | Direction |
| --- | --- | --- |
| Brand colour | Muted, low energy | One strong signature colour (indigo, deep teal or warm coral, chosen after Stage 7), used for primary actions and focus |
| AI accent | Not distinct | A violet to cyan gradient (#7C3AED to #06B6D4) used only on AI surfaces, so AI is recognisable at a glance |
| Status and severity | Soft tones | Vivid, consistent scale: critical red, high orange, medium amber, low green, each with a text label too |
| Surfaces | Flat panels | Layered cards with subtle shadows, crisp 1 px borders, a full dark mode |
| Type | Plain | A modern sans such as Inter or Geist, larger bolder headings, tabular numbers on metrics |
| Motion | Minimal | 150 to 250 ms transitions, skeleton shimmer while loading, a small success animation on save, drag feedback on the board, all off when reduced motion is set |
| Density | One setting | Comfortable and compact modes, keyboard shortcuts shown in tooltips |
| Dashboard | Charts in panels | Hero metrics with sparklines and trend arrows, colour coded readiness cards |

One caution: vibrant must not mean noisy. Keep colour for meaning (actions, status, AI), and keep everything else calm.

## Roadmap

New stages, run the same approval gated way as Stages 1 to 6. The design is locked first so every later stage builds to one look. Full prompts for each step are in `docs/roadmap/STAND_OUT_PROMPTS.md`.

0. **Prompt 0: health check and free live AI.** Prove today's app works, add free Gemini, Groq and OpenRouter support, run the live AI smoke test.
1. **Stage 7: requirements and design lock.** New look prototype in light and dark with three brand themes, REQ-064 onward, the issue plan. No product code. Gate: you approve the design and pick the theme.
2. **Stage 8: new design system and the AI front door.** New theme and dark mode, AI icon and chat, AI home, bring your own API key. Gate: stage review and green CI.
3. **Stage 9: admin settings and workspace controls.** All 12 settings areas, custom roles, workflow, fields, SLAs, security, notifications. Gate: stage review and green CI.
4. **Stage 10: reporting, testing depth and guidance.** Written QA report with PDF and share link, richer dashboard, test plans, exploratory sessions, guide centre, tours. Gate: stage review and green CI.
5. **Stage 11A: integrations, MCP and capture.** GitHub and Slack, CI results, then Jira; webhooks, API keys, the MCP server, the browser capture extension. Gate: stage review and green CI.
6. **Stage 11B: launch readiness.** Pricing page, rate limit, demo mode, free hosting, final QA report v2. Gate: final approval, then the public demo goes live.

Target: public demo around 28 December 2026 (best case 23 December, worst case mid January 2027).

## Your decisions

Decided on 27 November 2026. Two items stay open until later stages.

| Decision | Your answer |
| --- | --- |
| Who it is for | Everyone in the list: freelance QA testers, freelance creators, small agencies, startup product teams and enterprise QA. First focus: small agencies and startup teams |
| Integrations order | GitHub and Slack first, CI results import next, Jira after |
| Brand colour | Indigo, deep teal or warm coral, chosen after seeing them in the Stage 7 prototype |
| Go live | A public demo after Stage 11, on free hosting only |
| Live AI | No paid credit: Gemini free tier first, Groq or OpenRouter as fallback |
| Bring your own AI | Two options: QA Pilot as an MCP server for Claude, ChatGPT and any MCP capable AI, and bring your own API key. The default AI runs on a free provider |
| Pricing | An in app pricing page with Solo Flight, Co-Pilot, Flight Crew and Mission Control; paid plans on a waitlist |
| Still open | The brand colour (after Stage 7) and which free host runs the demo (checked in Stage 11) |

## Sources

- [Qase AI software testing](https://www.qase.io/ai-software-testing/) and [AI in Qase, credits and admin switch](https://docs.qase.io/en/articles/14442830-ai-in-qase)
- [BrowserStack Ask AI](https://www.browserstack.com/docs/test-management/browserstack-ai/ask-ai) and [AI agents plan limits](https://www.browserstack.com/docs/test-management/browserstack-ai)
- [G2: Zephyr Scale, Qase, Tuskr vs TestRail](https://www.g2.com/compare/zephyr-scale-vs-qase-vs-tuskr-vs-testrail) and [G2: Qase reviews](https://www.g2.com/survey_responses/qase-review-9887520)
- [Testmo review](https://laravel-news.com/testmo-review-unified-test-management)
- [Jam documentation](https://jam.dev/docs/~gitbook/pdf) and [G2: Jam.dev pricing](https://g2.com/products/jam-dev/reviews)
- [G2: Linear reviews](https://www.g2.com/products/linear/reviews/linear-review-11207982), [Linear Agent](https://linear.app/changelog/2026-03-24-introducing-linear-agent) and [ClickUp on Linear's reporting tiers](https://clickup.com/blog/linear-alternatives/)
- [QA.tech: best agentic QA tools 2026](https://qa.tech/blog/best-agentic-qa-tools-in-2026)
- [OpenAI: using your ChatGPT plan in other apps and sites](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- [Zed: using an existing Claude or ChatGPT subscription](https://zed.dev/docs/ai/use-an-existing-subscription.html)
- [Gemini API pricing, free tier](https://ai.google.dev/gemini-api/docs/pricing), [Free AI APIs, November 2026](https://pricepertoken.com/free-ai-api) and [Free LLM APIs, September 2026](https://decodethefuture.org/?p=4494)
- QA Pilot repository on GitHub (Bilex95/qa-pilot): settings page, navigation and the final QA report, read 27 November 2026
