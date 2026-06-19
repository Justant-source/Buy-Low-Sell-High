# Manual Operations

Recommendations are advisory outputs only. Actual manual fills will be stored append-only and must be reversible through explicit reversal events rather than destructive edits.

Manual ledger backup and restore must preserve the append-only audit trail. Any restore action requires an explicit confirmation token, must import a full exported ledger snapshot rather than patching individual fills in place, and must match the selected profile account and thread count.

Manual dashboards should show recommendation-to-fill drift explicitly. A recommendation remains advisory until a matching manual fill is recorded, and price differences between the recommendation basis and the actual fill must be visible rather than overwritten.
