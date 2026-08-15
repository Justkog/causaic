---
name: author-causaic-workflows
description: Use the Causaic operator MCP to browse platform workflow catalog versions, inspect schemas, and create or manage cause-private workflow families and versions. Trigger when a user wants to select a workflow or author a private workflow for a cause.
---

# Author and select Causaic workflows

Distinguish read-only platform catalog resources from cause-private authoring. Use `workflows_list_catalog`, `workflows_list_selectable_versions`, `workflow_get_catalog`, `workflow_version_get_catalog`, and `workflow_version_get_schemas` to inspect platform definitions and schemas. Platform definitions cannot be edited.

For private workflows, use `workflows_list_private` and the private family/version tools. Create a family and draft version with unique request IDs, validate structured input against the returned schema, edit only drafts, and publish only after validation succeeds. Published versions are immutable; deprecation is owner-only where the backend requires it.

Return portable workflow family/version IDs and immutable definition metadata. Never copy a schema from memory, cross a cause boundary, or pin a draft, deprecated, unpublished, or non-selectable version. A workstream must use a currently published, cause-selectable version.
