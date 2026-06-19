# Backup And Restore

## Scope
- Manual ledger backups only
- Research run artifacts stay separate from manual ledger snapshots
- Restores must preserve append-only fill history

## Backup
1. Run `make backup`
2. Snapshot files are written to `data/runtime/backups/`
3. Each backup file is copied from `data/runtime/dashboard/manual-ledger-*.json`

## Restore Validation
1. Run `make backup-restore-test`
2. The test creates an isolated ledger, exports it, mutates it, restores from backup, and verifies the restored JSON matches the original snapshot
3. No live runtime ledger file is modified by this test

## Safety Rules
- Restore only from a full ledger snapshot
- Do not patch individual fill events inside a backup file
- Keep recommendation outputs separate from actual fill records
