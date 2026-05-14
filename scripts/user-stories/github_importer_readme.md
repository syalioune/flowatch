# GitHub Issues Importer

A robust Python script for importing issues from CSV files into GitHub repositories using the GitHub REST API.

## 🚀 Features

- **Multiline CSV Support**: Handles complex CSV files with multiline fields, quotes, and special characters
- **Automatic Milestone Creation**: Creates milestones if they don't exist in the target repository
- **Label Processing**: Automatically splits and applies comma-separated labels
- **Dry Run Mode**: Preview what will be created before making actual changes
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
| `Title` | ✅ Yes | Issue title | `[Bug] Login form not working` |
| `Body` | ❌ No | Issue description (supports multiline) | `Steps to reproduce:\n1. Go to login\n2. Enter credentials...` |
| `Labels` | ❌ No | Comma-separated labels | `bug, high-priority, frontend` |
| `Milestone` | ❌ No | Milestone name | `v1.0.0` |

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

## 🔍 Example Output

### Dry Run Mode:
```
[INFO] Connecting to repository: myuser/myrepo
[SUCCESS] Successfully connected to repository: myuser/myrepo
[INFO] Parsing CSV file: issues.csv
[SUCCESS] Successfully parsed 5 issues from CSV
[INFO] Starting import of 5 issues...
[WARNING] DRY RUN MODE - No issues will be created
[INFO] [1] Would create issue: [Bug] Login form validation
[VERBOSE]   Labels: bug, frontend, high-priority
[VERBOSE]   Milestone: v1.0.0
[INFO] Would create milestone: v1.0.0
[SUCCESS] [1] Created issue #1: [Bug] Login form validation

=== IMPORT SUMMARY ===
Repository: myuser/myrepo
Total issues processed: 5
Successfully created: 5
Milestones created: 2

This was a dry run. To actually create issues, run without --dry-run flag.

Import completed successfully! 🎉
```

### Actual Import:
```
[INFO] Connecting to repository: myuser/myrepo
[SUCCESS] Successfully connected to repository: myuser/myrepo
[INFO] Starting import of 5 issues...
[SUCCESS] Created milestone: v1.0.0
[SUCCESS] [1] Created issue #123: [Bug] Login form validation
[SUCCESS] [2] Created issue #124: [Feature] Add dark mode
...

=== IMPORT SUMMARY ===
Repository: myuser/myrepo
Total issues processed: 5
Successfully created: 5
Milestones created: 2

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