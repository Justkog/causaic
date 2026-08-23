# ADR 0036: Use one flexible validation-example contract

Validation examples are stored on the validation task as a bounded array of
objects with an optional semantic input and a required validation result:

```json
{
  "input": {
    "jobInput": {},
    "artifactContent": {},
    "parameters": null
  },
  "result": {
    "decision": "accept",
    "summary": "The artifact is valid.",
    "issues": []
  }
}
```

Omitting `input` gives agents a result-only example. This keeps examples
flexible across workflows while avoiding separate parameter and result arrays
that cannot express a paired validation case consistently.

Validation parameter examples use JSON Schema's standard `examples` annotation.
Example identifiers, hashes, and other provenance remain outside the semantic
example contract.
