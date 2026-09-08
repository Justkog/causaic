# Source-verification development fixture

This private workspace package provides the deterministic source-verification
workflow used by runner tests, demos, and cloud development seed data.

It is a development fixture, not the runtime source of truth for workflows
created through the MCP or web app. Keep its workflow identifiers and schema
hashes stable when changing consumers that depend on this vertical slice.
