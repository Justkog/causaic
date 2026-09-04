---
name: author-causaic-workflows
description: Use the Causaic operator MCP to browse platform workflow catalog versions, inspect schemas, create or manage cause-private workflow families and versions, and explicitly share published private versions with the platform catalog. Trigger when a user wants to select a workflow, author a private workflow, or share one exact version for catalog use.
---

# Author and select Causaic workflows

Distinguish read-only platform catalog resources from cause-private authoring. Use `workflows_list_catalog`, `workflows_list_selectable_versions`, `workflow_get_catalog`, `workflow_version_get_catalog`, and `workflow_version_get_schemas` to inspect platform definitions and schemas. Platform definitions cannot be edited.

For private workflows, use `workflows_list_private` and the private family/version tools. Create a family and draft version with unique request IDs, validate structured input against the returned schema, edit only drafts, and publish only after validation succeeds. Published versions are immutable; deprecation is owner-only where the backend requires it.

To share a published private version, call `workflow_version_share_public` with its exact cause, family, and version IDs. Sharing is explicit and per-version; it copies that immutable version into the platform catalog. Use `workflow_version_hide_public` or `workflow_version_unhide_public` to control author visibility. An administrator ban overrides author visibility, and hiding does not interrupt existing pins. Never use another cause's private source version directly; select only the catalog copy for new work.

Return portable workflow family/version IDs and immutable definition metadata. Never copy a schema from memory, cross a cause boundary, or pin a draft, deprecated, unpublished, or non-selectable version. A new workstream must use a currently published, cause-selectable version. A deprecated version may remain pinned to an existing workstream and continue serving its existing jobs/opportunities; deprecation only prevents new pins.
