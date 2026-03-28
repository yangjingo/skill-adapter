# sa summary - Evolution Metrics Comparison

## Overview

`sa summary` command views skill evolution metrics comparison, showing in table format:
- Baseline vs Evolved metrics comparison
- Change percentage and status
- Intelligently generated evolution conclusion

---

## Command Format

```bash
sa summary <skillName>
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `skillName` | Skill name (required) |

---

## Usage Examples

### 1. View Skill Evolution Metrics

```bash
sa summary hccn-tools
```

**Output Example:**
```
📊 Evolution Summary: hccn-tools

┌─────────────────────┬─────────────────┬─────────────────┬──────────┬──────────────────┐
│ Metric              │ Baseline (v1.0.0)│ Evolved (v1.6.3)│ Change   │ Status           │
├─────────────────────┼─────────────────┼─────────────────┼──────────┼──────────────────┤
│ Optimizations       │               0 │              11 │    +100% │ ✅ Enhanced       │
│ Applied Patches     │               0 │               1 │    +100% │ ✅ Enhanced       │
│ Style Rules         │               0 │               5 │    +100% │ ✅ Enhanced       │
│ Error Avoidances    │               0 │              34 │    +100% │ ✅ Enhanced       │
│ Env Adaptations     │               0 │               0 │        - │ ➖ Stable         │
└─────────────────────┴─────────────────┴─────────────────┴──────────┴──────────────────┘

📁 Workspace: TypeScript | npm

📝 Conclusion:
   ✅ Evolution applied: 5 style rules, 34 error avoidances.
   ℹ️  10 optimization(s) skipped (cross-skill learning available).
   📈 Version progressed from v1.0.0 to v1.6.3 across 25 evolution(s).

📌 Next Steps:
   sa log hccn-tools          # View detailed changes
   sa share hccn-tools        # Create PR
   sa export hccn-tools       # Export local package
```

### 2. No Evolution Records

```bash
sa summary new-skill
```

**Output Example:**
```
❌ No evolution records found for "new-skill"

📌 Next Steps:
   sa evolve new-skill    # Run evolution analysis first
```

---

## Metrics Description

| Metric | Description |
|--------|-------------|
| **Optimizations** | Total optimization suggestions |
| **Applied Patches** | Number of applied patches |
| **Style Rules** | Number of injected style rules |
| **Error Avoidances** | Number of error avoidance rules |
| **Env Adaptations** | Number of environment adaptations |

---

## Status Icons

| Icon | Meaning |
|------|---------|
| ✅ Enhanced | Metric enhanced |
| ✅ Optimized | Optimized (cost reduced) |
| ➖ Stable | Remains stable |
| ⚠️ Increased | Has increased |
| ⚠️ Reduced | Has reduced |

---

## Conclusion Content

Conclusion is generated based on actual evolution data:

| Situation | Conclusion Content |
|-----------|-------------------|
| Has applied changes | Shows change types and counts, version progress |
| Has skipped optimizations | Notes cross-skill learning available |
| No significant changes | Recommends running `sa evolve` to analyze new optimizations |

---

## Context Information

If available, also shows:

| Information | Source |
|-------------|--------|
| 📁 Workspace | Workspace language and package manager |
| 📚 Context | Loaded context files (SOUL.md, MEMORY.md) |

---

## Test Steps

1. **View evolved skill metrics**
   ```bash
   sa summary <skill-with-evolutions>
   ```

2. **View skill without evolution records**
   ```bash
   sa summary <new-skill>
   ```

3. **Compare log and summary output**
   ```bash
   sa log <skill-name>
   sa summary <skill-name>
   ```

---

## Next Steps

After viewing evolution metrics, use `sa log` to view detailed change history, or use `sa share` to share the skill.
