# GitHub Issues Importer

A robust Python script for importing issues from CSV files into GitHub repositories using the GitHub REST API.

## 🚀 Features

- **Idempotent re-runs**: Re-importing the same CSV updates existing issues in place (matched by story-identifier prefix in the title, e.g. `FND-SYS-006`) instead of creating duplicates
- **Multiline CSV Support**: Handles complex CSV files with multiline fields, quotes, and special characters
- **Automatic Milestone Creation**: Creates milestones if they don't exist in the target repository
- **Label Processing**: Automatically splits and applies comma-separated labels
- **Dry Run Mode**: Preview what will be created or updated before making actual changes
- **Rate Limiting**: Built-in delays to respect GitHub API limits
- **Rich Output**: Colored terminal output with progress tracking and detailed statistics
- **Error Handling**: Comprehensive error messages and graceful failure handling
- **Flexible Authentication**: Support for token via command line or environment variable

## 📋 Requirements

- Python 3.6 or higher
- PyGithub library
- GitHub personal access token with `repo` permissions
- CSV file with required columns

## 🛠 Installation

1. **Clone or download the script**:
   ```bash
   wget https://raw.githubusercontent.com/your-repo/import_issues.py
   # or
   curl -O https://raw.githubusercontent.com/your-repo/import_issues.py
   ```

2. **Install required Python package**:
   ```bash
   pip install PyGithub
   ```

3. **Make the script executable** (optional):
   ```bash
   chmod +x import_issues.py
   ```

## 🔑 GitHub Token Setup

1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes:
   - ✅ **repo** (Full control of private repositories)
   - ✅ **public_repo** (if working with public repositories only)
4. Copy the generated token

## 📊 CSV Format

Your CSV file must contain the following columns:

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| `Title` | ✅ Yes | Issue title — should start with a story identifier prefix (see [Idempotency](#-idempotency)) | `FND-SYS-006: Add SPDX headers to new files` |
| `Body` | ❌ No | Issue description (supports multiline) | `Steps to reproduce:\n1. Go to login\n2. Enter credentials...` |
| `Labels` | ❌ No | Comma-separated labels | `bug, high-priority, frontend` |
| `Milestone` | ❌ No | Milestone name | `v1.0.0` |

> **Title prefix convention** — Titles whose first token matches `[A-Z0-9]+-[A-Z]+-\d+` (e.g. `AUT-MIR-002`, `FND-SYS-006`) are treated as story identifiers and used as the idempotency key on re-runs. Rows without a recognizable prefix still get imported, but cannot be deduplicated and will produce a new issue each time — the script emits a `[WARNING]` for those rows.

### Example CSV:
```csv
Title,Body,Labels,Milestone
"[Bug] Login fails","User cannot login to the system

Steps to reproduce:
1. Navigate to /login
2. Enter valid credentials
3. Click submit

Expected: User should be logged in
Actual: Error message appears","bug, high-priority",v1.0.0
"[Feature] Add dark mode","As a user
I want a dark mode option
So that I can use the app in low light","feature, ui/ux",v2.0.0
```

## 🎯 Usage

### Basic Usage

```bash
python import_issues.py --repo owner/repository --token YOUR_GITHUB_TOKEN
```

### Recommended First Run (Dry Run)

```bash
python import_issues.py --repo owner/repository --token YOUR_GITHUB_TOKEN --dry-run --verbose
```

### Using Environment Variable for Token

```bash
export GITHUB_TOKEN="your_github_token_here"
python import_issues.py --repo owner/repository --dry-run
```

### Custom CSV File

```bash
python import_issues.py --repo owner/repository --token YOUR_TOKEN --file custom_issues.csv
```

### Complete Example with All Options

```bash
python import_issues.py \
  --repo myusername/myproject \
  --token ghp_xxxxxxxxxxxxxxxxxxxx \
  --file project_backlog.csv \
  --dry-run \
  --verbose
```

## 📝 Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--repo` | `-r` | GitHub repository (owner/repo) | **Required** |
| `--token` | `-t` | GitHub personal access token | Uses `GITHUB_TOKEN` env var |
| `--file` | `-f` | Path to CSV file | `flowatch_backlog.csv` |
| `--dry-run` | `-d` | Preview mode - don't create issues | `False` |
| `--verbose` | `-v` | Enable detailed output | `False` |
| `--help` | `-h` | Show help message | - |

## ♻️ Idempotency

The importer is **safe to re-run** against the same repository — it will not create duplicates.

**How it works:**
1. On startup, the script lists every issue in the repo (open + closed, excluding PRs) and builds an in-memory index of `prefix → existing issue`.
2. For each CSV row, it extracts the story prefix from the title (e.g. `FND-SYS-006`).
3. If the prefix is already in the index, the existing issue is **updated in place** via `issue.edit(...)` — title, body, labels, and milestone are overwritten with the CSV values (the CSV is treated as the source of truth).
4. If no matching prefix exists, a new issue is created and added to the index (so duplicate prefixes inside the same CSV also fold into a single issue).
5. Rows whose title lacks a recognizable prefix print a `[WARNING]` and are still created — they just can't be deduplicated on subsequent runs.

**Implications:**
- Editing a story's body or labels in the source markdown → regenerate the CSV → re-run the importer → the corresponding GitHub issue is rewritten to match.
- Emptying the `Milestone` column on a row will **clear** the milestone on the existing issue on next run. Same for `Labels` — an empty list strips them. If a row's column is empty by accident, it will erase the corresponding field. Treat the CSV as authoritative.
- Renaming a story's prefix (e.g. `FND-SYS-006` → `FND-SYS-007`) is treated as deleting the old story and creating a new one; the old GitHub issue is **not** automatically closed.

## 🔍 Example Output

### Dry Run Mode (first run — all new):
```
[INFO] Connecting to repository: myuser/myrepo
[SUCCESS] Successfully connected to repository: myuser/myrepo
[INFO] Indexing existing issues for idempotency check...
[SUCCESS] Indexed 0 existing issues (0 with story prefixes)
[INFO] Parsing CSV file: issues.csv
[SUCCESS] Successfully parsed 5 issues from CSV
[INFO] Starting import of 5 issues...
[WARNING] DRY RUN MODE - No issues will be created or updated
[INFO] [1] Would create issue: FND-SYS-006: Add SPDX headers to new files
[VERBOSE]   Labels: chore, priority:medium
[VERBOSE]   Milestone: v1.0.0
...

=== IMPORT SUMMARY ===
Repository: myuser/myrepo
Total issues processed: 5
Created: 5
Updated: 0
```

### Actual Import (subsequent run — content changes picked up):
```
[INFO] Connecting to repository: myuser/myrepo
[SUCCESS] Successfully connected to repository: myuser/myrepo
[INFO] Indexing existing issues for idempotency check...
[SUCCESS] Indexed 5 existing issues (5 with story prefixes)
[INFO] Starting import of 5 issues...
[SUCCESS] [1] Updated issue #123 (FND-SYS-006): FND-SYS-006: Add SPDX headers to new files
[SUCCESS] [2] Updated issue #124 (AUT-MIR-002): AUT-MIR-002: Per-connection auth strategy
[SUCCESS] [3] Created issue #128: NEW-MIR-001: Brand new story not seen before
...

=== IMPORT SUMMARY ===
Repository: myuser/myrepo
Total issues processed: 5
Created: 1
Updated: 4

Import completed successfully! 🎉
```

## 🛡 Error Handling

The script handles various error conditions gracefully:

- **Authentication errors**: Invalid or expired tokens
- **Repository access**: Non-existent or inaccessible repositories  
- **CSV parsing errors**: Malformed CSV files or missing columns
- **API rate limits**: Built-in delays and retry logic
- **Network issues**: Connection timeouts and failures

### Common Error Messages:

```bash
[ERROR] Repository 'owner/repo' not found or not accessible
[ERROR] GitHub token is required. Provide it via --token argument or GITHUB_TOKEN environment variable  
[ERROR] Missing required columns: Title
[ERROR] CSV file not found: nonexistent.csv
```

## 🎛 Advanced Usage

### Environment Variables

Set your GitHub token as an environment variable:

```bash
# Bash/Zsh
export GITHUB_TOKEN="your_token_here"

# Fish shell
set -x GITHUB_TOKEN "your_token_here"

# Windows Command Prompt
set GITHUB_TOKEN=your_token_here

# Windows PowerShell
$env:GITHUB_TOKEN="your_token_here"
```

### Batch Processing Multiple Files

```bash
# Process multiple CSV files
for file in *.csv; do
    echo "Processing $file..."
    python import_issues.py --repo owner/repo --file "$file" --dry-run
done
```

### Integration with CI/CD

```yaml
# GitHub Actions example
- name: Import Issues
  run: |
    python import_issues.py \
      --repo ${{ github.repository }} \
      --token ${{ secrets.GITHUB_TOKEN }} \
      --file issues.csv
```

## 🐛 Troubleshooting

### Issue: "PyGithub not found"
```bash
pip install PyGithub
# or with explicit Python version
python3 -m pip install PyGithub
```

### Issue: "Authentication failed"
- Verify your token is correct and not expired
- Ensure token has `repo` permissions
- Check if you're using the correct repository name format (`owner/repo`)

### Issue: "Repository not found"
- Verify repository exists and you have access
- Check spelling of owner and repository names
- Ensure repository is not private (unless token has access)

### Issue: "CSV parsing error"
- Verify CSV has required columns: `Title`, `Body`, `Labels`, `Milestone`
- Check for proper CSV formatting with quotes around multiline fields
- Ensure file encoding is UTF-8

## 📈 Rate Limiting

The script includes built-in rate limiting:
- **0.5 second delay** between API calls
- Respects GitHub's API rate limits (5000 requests/hour for authenticated users)
- For large imports, consider running during off-peak hours

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and enhancement requests.

### Development Setup

```bash
git clone your-repo-url
cd github-issues-importer
pip install -r requirements.txt  # PyGithub
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [PyGithub](https://github.com/PyGithub/PyGithub) for GitHub API integration
- GitHub REST API documentation
- Python CSV module for robust parsing

---

**Happy Issue Importing!** 🎉

If you find this tool helpful, please consider giving it a ⭐ star!