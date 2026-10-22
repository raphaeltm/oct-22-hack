# Agent instructions

## SAM agent resources

Before dispatching an agent, check whether you are running in SAM by testing
for a non-empty `SAM_WORKSPACE_ID` or `SAM_PROJECT_ID` environment variable.
Inspect variable presence only; never print tokens or other secret values.

When running in SAM, use SAM's `dispatch_task` tool for delegation and explicitly
set these resource requirements on every dispatched agent:

```json
{
  "resourceRequirements": {
    "minVcpu": 0.3,
    "minMemoryGb": 1.5
  }
}
```

Use exactly 0.3 vCPU and 1.5 GB RAM. Do not omit these fields, rely on inherited
profile defaults, use the legacy `vmSize` setting, or increase the allocation
without explicit user authorization. Include this requirement in delegated task
instructions so it applies to all descendant agents as well.
