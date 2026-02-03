---
name: draft-pr
description: Commit changes, push branch, and create a draft PR
---

## Create Draft PR

### Steps

1. **Ensure on feature branch**
   - If on `main`: Ask for short description and create branch `feature/{description}`
   - Checkout: `git checkout -b <branch-name>`
   - If already on feature branch → continue

2. **Commit changes**
   - `git add .`
   - Commit format: `feat: <summary>` or `fix: <summary>` based on change type

3. **Push branch**
   - `git push -u origin HEAD`

4. **Create Draft PR**
   - `gh pr create --draft`
   - Title from latest commit message
   - Base branch: `main`
   - PR description format (What and Why only - NO test plan):
     ```
     ## What
     [1-3 sentences: What does this PR do?]

     ## Why
     [1-3 sentences: Why is this change needed?]
     ```
   - **IMPORTANT:** Do NOT include a test plan section in the PR description
