<!-- Select one variant, replace verified fields, and remove unused sections. -->

# Release {{version}}

Release date: {{date}}
Compare range: {{previous_tag}}...{{tag_or_sha}}

{{Short summary of the user-visible changes and their impact.}}

## Highlights

- **{{Change}}** — {{What users can now do or what behavior improved.}} ({{verified_PR}})

## Changes

### {{Domain}}

- {{Change and practical impact.}} ({{verified_PR}})

## Upgrade

- {{Required action, configuration change, compatibility impact, or verified absence of changes.}}

## Contributors

{{Verified GitHub handles; omit if unavailable.}}

**Full Changelog:** {{verified_compare_URL}}

<!-- Hotfix variant -->

# Hotfix {{version}}

**Scope:** {{Affected behavior and regression range.}}

## What's Fixed

- **{{Symptom}}** — {{Corrected behavior.}} ({{verified_PR}})

## Upgrade

- {{Deployment action and verified schema/configuration impact.}}

## Owner

{{Verified PR author or responsible maintainer.}}

<!-- Migration variant -->

# Migration {{version}}

**Scope:** {{Schema or data change and affected components.}}

## Migration Overview

- {{Added/changed/removed tables, columns, indexes, or data transformations.}}

## Operator Notes

- Execution: {{Automatic/manual command, order, expected duration, and locking impact.}}
- Preparation: {{Backup, maintenance window, and required configuration.}}
- Failure handling: {{Logs and state to inspect before retrying; resumption conditions.}}

## Compatibility and Recovery

- {{Compatibility with old/new application versions and rollout order.}}
- {{Tested rollback or restore procedure, data-loss risk, and irreversible steps.}}

## Owner

{{Verified migration owner and rollout responsibility.}}
