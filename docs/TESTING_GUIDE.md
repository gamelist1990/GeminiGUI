# Testing Guide for Agent Optimization Phase 2

## 🎯 Purpose
This guide helps verify that the Phase 2 optimizations work correctly and achieve the target completion rate of 70%+.

## ⚙️ Prerequisites

### Setup
1. Update to latest commit containing Phase 2 changes
2. Build the application: `cd app && npm run build && npm run tauri build`
3. Configure settings:
   - Set `approvalMode` to `yolo` for autonomous operation
   - Set `maxContinuations` to `15` (default)
   - Enable necessary tools in Tool Settings

### Environment
- Ensure workspace has write permissions
- Test with a fresh workspace to avoid interference from previous tests
- Enable logging to capture detailed execution traces

## 🧪 Test Cases

### Test 1: Simple File Creation (Baseline)
**Objective**: Verify basic file operations work with improved error handling

**Steps**:
1. Create a new agent mode chat
2. Send prompt: "Create a file named test.txt in the workspace root with content 'Hello, World!'"

**Expected Results**:
- ✅ Completes in 1-2 continuations
- ✅ File created successfully
- ✅ update_task_progress called at least once
- ✅ No error messages

**Metrics to Check**:
- Continuations used: ≤2
- Tools called: 2-3 (update_task_progress, write_file)
- Completion: Yes
- Errors: None

### Test 2: Directory Creation with File Write
**Objective**: Test error recovery when directory doesn't exist

**Steps**:
1. Create a new agent mode chat
2. Send prompt: "Create a directory called 'reports' and write a file 'summary.md' inside it with content 'Test report'"

**Expected Results**:
- ✅ Completes in 1-2 continuations
- ✅ Directory created or recognized as existing
- ✅ File created successfully
- ✅ Multi-tool call: create_directory + write_file in same request

**Metrics to Check**:
- Continuations used: ≤2
- Multi-tool calls: ≥1 (should call both tools together)
- Completion: Yes
- Error recovery: If directory exists, should return success

### Test 3: Multiple File Operations (Multi-Tool Test)
**Objective**: Verify multi-tool calling is maintained

**Steps**:
1. Create a new agent mode chat
2. Send prompt: "Create three files: file1.txt with '1', file2.txt with '2', file3.txt with '3'"

**Expected Results**:
- ✅ Completes in 1-3 continuations
- ✅ All three files created
- ✅ Multiple write_file calls in same continuation
- ✅ update_task_progress + multiple write_file together

**Metrics to Check**:
- Continuations used: ≤3
- Multi-tool calls: ≥50% of continuations
- Average tools per continuation: ≥1.5
- Completion: Yes

### Test 4: Error Recovery (Permission Test)
**Objective**: Test improved error feedback

**Setup**: Create a read-only directory in workspace

**Steps**:
1. Manually create `readonly/` directory and set read-only permissions
2. Create a new agent mode chat
3. Send prompt: "Write a file to readonly/test.txt with content 'test'"

**Expected Results**:
- ⚠️ write_file fails with detailed error
- ✅ Error message mentions "Permission denied - check if directory is writable"
- ✅ AI recognizes the error and tries alternative (e.g., different directory)
- ✅ Eventually completes task in alternative location

**Metrics to Check**:
- Error message quality: Specific and actionable
- Recovery attempts: ≥1
- Alternative strategy: Yes
- Final completion: Yes (in different location)

### Test 5: Complex Task (Completion Rate Test)
**Objective**: Verify completion rate on realistic complex task

**Steps**:
1. Create a new agent mode chat
2. Send prompt: "Analyze this workspace and create a README.md file that includes:
   - Project structure (list directories and key files)
   - Brief description of what each main directory contains
   - Any configuration files found
   Use actual file inspection, not assumptions."

**Expected Results**:
- ✅ Completes within 15 continuations (default limit)
- ✅ README.md created with actual content
- ✅ Multiple tool calls per continuation (list_directory + read_file combos)
- ✅ update_task_progress called regularly (showing progress)

**Metrics to Check**:
- Continuations used: ≤15
- Completion: Yes
- Multi-tool rate: ≥40%
- File operations: Multiple reads + 1 write
- Quality: README contains real information, not placeholders

### Test 6: Stress Test (Max Continuations)
**Objective**: Verify system respects maxContinuations limit

**Setup**: Set maxContinuations to 5 in settings

**Steps**:
1. Create a new agent mode chat
2. Send complex prompt: "Create a detailed analysis of the codebase with:
   - Directory structure document
   - Main file summaries (5 most important files)
   - Dependency analysis
   - Save everything to analysis/ directory"

**Expected Results**:
- ⚠️ May not complete due to low limit (expected)
- ✅ Stops at exactly 5 continuations
- ✅ Partial progress is saved
- ✅ Error message indicates limit reached

**Metrics to Check**:
- Continuations used: Exactly 5
- Partial completion: Yes (some files created)
- Limit respected: Yes
- Error message: Clear indication of limit

### Test 7: Regression Test (Consistency)
**Objective**: Ensure multi-tool calling doesn't regress in later continuations

**Steps**:
1. Create a new agent mode chat
2. Send prompt requiring 8-10 continuations (e.g., "Create 10 test files with analysis")
3. Monitor tool usage pattern throughout

**Expected Results**:
- ✅ Continuation 1-3: Multi-tool usage (expected)
- ✅ Continuation 4-7: Multi-tool usage maintained (key test)
- ✅ Continuation 8-10: Multi-tool usage maintained (critical)
- ✅ No single-tool regression like in Phase 1

**Metrics to Check**:
- Multi-tool rate early (1-3): ≥40%
- Multi-tool rate middle (4-7): ≥40%
- Multi-tool rate late (8-10): ≥40%
- Regression: None

## 📊 Data Collection

### Log Analysis
For each test, extract these metrics from logs:

```bash
# Total continuations
grep "Continuation attempt" log.txt | wc -l

# Multi-tool calls (2 or more tools in one request)
grep "Executing tool.*([2-9]/[2-9])" log.txt | wc -l

# Single tool calls
grep "Executing tool.*(1/1)" log.txt | wc -l

# Completion check
grep "All tasks completed\|Task completed successfully" log.txt

# Error count
grep "Error:\|Failed to" log.txt | wc -l

# Error recovery
grep "Error:" log.txt -A5 | grep "retry\|alternative\|instead"
```

### Metrics Template
Create a spreadsheet or file with these columns:

| Test | Continuations | Multi-Tool % | Completion | Errors | Error Recovery | Notes |
|------|---------------|--------------|------------|--------|----------------|-------|
| T1   |               |              |            |        |                |       |
| T2   |               |              |            |        |                |       |
| ...  |               |              |            |        |                |       |

### Success Criteria
- **Overall completion rate**: ≥70% of tests complete successfully
- **Multi-tool rate**: ≥40% maintained across all continuations
- **Error recovery rate**: ≥70% of errors result in successful recovery
- **Average continuations**: 8-12 for complex tasks (down from 10/10 in Phase 1)

## 🔍 Debugging Failed Tests

### Test Failed: Doesn't Complete
**Symptoms**: Uses all continuations without finishing

**Checks**:
1. Were there tool errors? Check error messages
2. Did multi-tool rate drop in later continuations?
3. Is task too complex for current limit?

**Actions**:
- If errors: Check workspace permissions, verify paths
- If multi-tool drops: Review tool instructions in logs
- If too complex: Increase maxContinuations or simplify task

### Test Failed: Low Multi-Tool Rate
**Symptoms**: <40% multi-tool usage

**Checks**:
1. Are tools being called at all?
2. Is update_task_progress dominating?
3. Are instructions being followed?

**Actions**:
- Review tool instructions in continuation prompts
- Check if AI is receiving success/failure feedback
- Verify tool definitions are correct

### Test Failed: Error Recovery
**Symptoms**: Error occurs but AI doesn't recover

**Checks**:
1. Is error message specific enough?
2. Did AI receive the error in next continuation?
3. Does AI understand what to try next?

**Actions**:
- Review error message clarity
- Check error feedback mechanism
- Enhance error message if needed

## 📈 Performance Validation

### Baseline Comparison
Compare Phase 2 results with Phase 1 logs:

| Metric | Phase 1 | Phase 2 | Target | Status |
|--------|---------|---------|--------|--------|
| Completion | 0% | ? | 70% | ? |
| Multi-tool | 42% | ? | 40% | ? |
| Continuations | 10/10 | ? | 8-12/15 | ? |
| Error Recovery | N/A | ? | 70% | ? |

### Pass/Fail Criteria
Phase 2 is successful if:
- [x] Completion rate ≥ 70%
- [x] Multi-tool rate ≥ 40%
- [x] Average continuations ≤ 12
- [x] Error recovery ≥ 70%

If any criterion fails:
1. Analyze logs to identify specific issues
2. Adjust implementation based on findings
3. Re-test with updated code
4. Document changes and repeat

## 🎯 Next Steps After Testing

### If Tests Pass
1. Update documentation with actual metrics
2. Create release notes highlighting improvements
3. Consider Phase 3 enhancements:
   - Tool result caching
   - Adaptive continuation budgeting
   - Learning from failures

### If Tests Partially Pass
1. Identify specific failing scenarios
2. Prioritize fixes based on impact
3. Implement targeted improvements
4. Re-test affected cases

### If Tests Fail
1. Review core assumptions
2. Consider alternative approaches
3. Gather more data on failure patterns
4. Adjust optimization strategy

## 📝 Reporting Results

### Format
Create a report with:

1. **Executive Summary**
   - Overall pass/fail status
   - Key metrics achieved
   - Major findings

2. **Detailed Results**
   - Individual test outcomes
   - Metrics table
   - Log excerpts showing key behaviors

3. **Analysis**
   - What worked well
   - What needs improvement
   - Unexpected behaviors

4. **Recommendations**
   - Configuration adjustments
   - Code improvements
   - Future enhancements

### Example Report Structure
```markdown
# Phase 2 Testing Report

## Summary
- Tests run: 7
- Passed: 5 (71%)
- Completion rate: 75%
- Multi-tool rate: 45%

## Key Findings
- ✅ Error recovery works well (80% success)
- ✅ Multi-tool rate maintained
- ⚠️ Complex tasks need 18+ continuations
- ❌ Permission errors still challenging

## Recommendations
1. Increase default maxContinuations to 18
2. Enhance permission error messages
3. Add pre-flight permission checks
```

---

**Testing Duration**: ~2-3 hours for full suite
**Recommended Frequency**: After each significant change
**Last Updated**: 2025-10-06
