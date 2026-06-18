# State Machines

The Python engine implements a deterministic `FREE -> OPEN -> FREE` capital-thread lifecycle.

Current runtime state machine:

- `FREE`
- `OPEN`

Recommendation states must remain separate from actual manual ledger state.
