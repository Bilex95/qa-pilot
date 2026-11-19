# Backlog

Ideas outside v1 scope. Each item notes where it came from.

| ID | Idea | Source |
|---|---|---|
| BL-001 | Jira and GitHub Issues sync | BUILD_PLAN out of scope |
| BL-002 | SSO (SAML, OIDC) | BUILD_PLAN out of scope |
| BL-003 | Billing and plans | BUILD_PLAN out of scope |
| BL-004 | Native mobile apps | BUILD_PLAN out of scope |
| BL-005 | Real email delivery for invites and notifications | BUILD_PLAN out of scope |
| BL-006 | Cloud file storage (S3 compatible) for attachments | BUILD_PLAN out of scope |
| BL-007 | Move to ESLint 10 once eslint-config-next's plugins declare support (D-038) | Stage 3 dependency check |
| BL-008 | Password reset flow: admin issued links in v1 (I-23, D-045); self service by email when BL-005 lands | Stage 3 gate feedback |
| BL-009 | Root cause fix for a container left without a network after a failed start (I-24). Done in I-24 (D-048): port preflight, backend db check, WSL idle wrappers. Still open: the `instanceIdleTimeout=-1` setting is only documented; confirm it against the Microsoft docs before the product owner applies it | Stage 3 gate feedback |
| BL-010 | Coloured label chips: render the stored label colour token on chips (the approved design draws every chip neutral; needs a prototype change first) | I-02 |
| BL-012 | Members pager: the Members screen asks for 100 members and shows "Showing the first N of M"; add Previous and Next (page pagination, D-004) when a workspace has more than 100 people | I-10 |
| BL-013 | Leave workspace and self demotion: your own row on the Members screen is locked (D-049), so an Org Admin cannot step down or leave by themselves; add a "Leave workspace" action and a guarded self demotion when another Org Admin exists | I-10 |
| BL-011 | Undo on the label delete toast. Once I-03 lands, deleting a label removes it from every bug that has it, so the toast should offer Undo (restore the label and its bug links within the toast's lifetime). Linked to I-03 (bug_labels cascade) and BL-010 | I-02 |
| BL-014 | **High priority.** Invite token in URLs. The Stage 3 accept screen (`frontend/src/modules/orgs/components/invite-accept.tsx`) sends a signed out visitor to `/login?next=/invite/<token>` and `/register?next=/invite/<token>`, and the token is also in the page path `/invite/<token>` and the API path `GET /invitations/{token}`. A token in a URL leaks through browser history, server and proxy logs, and the Referer header sent to other sites. Proposed fix: (1) keep the return target out of the query string: store it in `sessionStorage` (tab scoped, removed on use, accepted only as a same origin relative path) and use plain `/login` and `/register` links; (2) put the token in the URL fragment (`/invite#<token>`, never sent to a server or in Referer) and send it to the API in a POST body (`POST /invitations/preview`, `POST /invitations/accept`), keeping the old paths for one release; (3) add `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on the invite and reset pages. Stage: batch 4B with I-23, because password reset links (D-045) need the same handling and should not copy the current pattern; I-21 (security review) verifies it. Not started | I-10 |
