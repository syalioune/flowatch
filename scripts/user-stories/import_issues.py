#!/usr/bin/env python
"""
GitHub Issues Import Script

This script imports issues from a CSV file to a GitHub repository
using the GitHub REST API via the PyGithub library.

Requirements:
    - PyGithub library: pip install PyGithub
    - GitHub personal access token with repo permissions
    - CSV file with columns: Title, Body, Labels, Milestone

Usage:
    python import_issues.py --repo owner/repo --token YOUR_TOKEN
    python import_issues.py --repo owner/repo --token YOUR_TOKEN --dry-run --verbose
    python import_issues.py -r owner/repo -t YOUR_TOKEN -f custom_backlog.csv
"""

import argparse
import csv
import re
import sys
import time
import os
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

# Story identifier prefix at the start of a title, e.g. "FND-SYS-006" in
# "FND-SYS-006: Add SPDX headers". Used as the idempotency key when importing.
STORY_PREFIX_RE = re.compile(r'^([A-Z0-9]+-[A-Z]+-\d+)\b')

try:
    from github import Github, GithubException
    from github.Repository import Repository
    from github.Milestone import Milestone
    from github.Issue import Issue
except ImportError:
    print("ERROR: PyGithub library is required but not installed.")
    print("Please install it with: pip install PyGithub")
    sys.exit(1)

# Color codes for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    PURPLE = '\033[0;35m'
    CYAN = '\033[0;36m'
    WHITE = '\033[1;37m'
    NC = '\033[0m'  # No Color

@dataclass
class IssueData:
    """Data structure for issue information"""
    title: str
    body: str
    labels: List[str]
    milestone: Optional[str]
    
    def __post_init__(self):
        # Clean up labels by splitting and stripping whitespace
        if isinstance(self.labels, str):
            self.labels = [label.strip() for label in self.labels.split(',') if label.strip()]

class GitHubImporter:
    """GitHub Issues Importer"""
    
    def __init__(self, repo_name: str, token: str, dry_run: bool = False, verbose: bool = False):
        self.repo_name = repo_name
        self.dry_run = dry_run
        self.verbose = verbose
        self.github = Github(token)
        self.repo: Optional[Repository] = None
        self.milestones_cache: Dict[str, Milestone] = {}
        self.existing_issues_by_prefix: Dict[str, Issue] = {}

        # Statistics
        self.stats = {
            'total_issues': 0,
            'created_issues': 0,
            'updated_issues': 0,
            'created_milestones': 0,
            'errors': 0
        }
    
    def print_info(self, message: str):
        """Print info message in blue"""
        print(f"{Colors.BLUE}[INFO]{Colors.NC} {message}")
    
    def print_success(self, message: str):
        """Print success message in green"""
        print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")
    
    def print_warning(self, message: str):
        """Print warning message in yellow"""
        print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")
    
    def print_error(self, message: str):
        """Print error message in red"""
        print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")
    
    def print_verbose(self, message: str):
        """Print verbose message if verbose mode is enabled"""
        if self.verbose:
            print(f"{Colors.CYAN}[VERBOSE]{Colors.NC} {message}")
    
    def initialize_repo(self) -> bool:
        """Initialize and validate repository access"""
        try:
            self.print_info(f"Connecting to repository: {self.repo_name}")
            self.repo = self.github.get_repo(self.repo_name)
            
            # Test repository access
            _ = self.repo.name  # This will raise an exception if no access
            
            self.print_success(f"Successfully connected to repository: {self.repo.full_name}")
            if self.verbose:
                self.print_verbose(f"Repository description: {self.repo.description or 'No description'}")
                self.print_verbose(f"Repository URL: {self.repo.html_url}")
            
            return True
            
        except GithubException as e:
            if e.status == 404:
                self.print_error(f"Repository '{self.repo_name}' not found or not accessible")
                self.print_error("Make sure the repository exists and your token has the correct permissions")
            elif e.status == 401:
                self.print_error("Authentication failed. Please check your GitHub token")
            else:
                self.print_error(f"GitHub API error: {e.data.get('message', str(e))}")
            return False
        except Exception as e:
            self.print_error(f"Unexpected error connecting to repository: {str(e)}")
            return False
    
    @staticmethod
    def extract_prefix(title: str) -> Optional[str]:
        """Return the story identifier prefix (e.g. 'FND-SYS-006') from a title, or None."""
        match = STORY_PREFIX_RE.match(title.strip())
        return match.group(1) if match else None

    def build_existing_prefix_index(self) -> bool:
        """Scan all repo issues (open + closed, excluding PRs) and cache them by prefix."""
        try:
            self.print_info("Indexing existing issues for idempotency check...")
            count = 0
            for issue in self.repo.get_issues(state='all'):
                # PyGithub exposes PRs via the issues endpoint too; skip them.
                if getattr(issue, 'pull_request', None) is not None:
                    continue
                prefix = self.extract_prefix(issue.title or "")
                if prefix:
                    # If a prefix collides across multiple issues, prefer the lowest
                    # issue number (oldest) so updates always target the same one.
                    existing = self.existing_issues_by_prefix.get(prefix)
                    if existing is None or issue.number < existing.number:
                        self.existing_issues_by_prefix[prefix] = issue
                count += 1
            self.print_success(
                f"Indexed {count} existing issues ({len(self.existing_issues_by_prefix)} with story prefixes)"
            )
            return True
        except GithubException as e:
            self.print_error(f"Failed to list existing issues: {e.data.get('message', str(e))}")
            return False
        except Exception as e:
            self.print_error(f"Unexpected error indexing existing issues: {str(e)}")
            return False

    def get_or_create_milestone(self, milestone_name: str) -> Optional[Milestone]:
        """Get existing milestone or create a new one"""
        if not milestone_name:
            return None
        
        # Check cache first
        if milestone_name in self.milestones_cache:
            return self.milestones_cache[milestone_name]
        
        try:
            # Look for existing milestone
            milestones = list(self.repo.get_milestones(state='all'))
            for milestone in milestones:
                if milestone.title == milestone_name:
                    self.milestones_cache[milestone_name] = milestone
                    self.print_verbose(f"Found existing milestone: {milestone_name}")
                    return milestone
            
            # Create new milestone if not found
            if self.dry_run:
                self.print_info(f"Would create milestone: {milestone_name}")
                # Create a dummy milestone for dry run
                class DummyMilestone:
                    def __init__(self, title):
                        self.title = title
                        self.number = 999
                
                dummy_milestone = DummyMilestone(milestone_name)
                self.milestones_cache[milestone_name] = dummy_milestone
                return dummy_milestone
            else:
                milestone = self.repo.create_milestone(
                    title=milestone_name,
                    description=f"Milestone created by import script"
                )
                self.milestones_cache[milestone_name] = milestone
                self.stats['created_milestones'] += 1
                self.print_success(f"Created milestone: {milestone_name}")
                return milestone
                
        except GithubException as e:
            self.print_error(f"Error handling milestone '{milestone_name}': {e.data.get('message', str(e))}")
            return None
        except Exception as e:
            self.print_error(f"Unexpected error with milestone '{milestone_name}': {str(e)}")
            return None
    
    def create_or_update_issue(self, issue_data: IssueData, issue_number: int) -> Tuple[bool, str]:
        """Create a GitHub issue, or update the existing one if a matching prefix is indexed.

        Returns (success, action) where action is one of 'created', 'updated', 'error'.
        """
        try:
            prefix = self.extract_prefix(issue_data.title)
            existing = self.existing_issues_by_prefix.get(prefix) if prefix else None

            if self.dry_run:
                if existing:
                    self.print_info(
                        f"[{issue_number}] Would update issue #{existing.number} ({prefix}): {issue_data.title}"
                    )
                else:
                    verb = "create"
                    if not prefix:
                        self.print_warning(
                            f"[{issue_number}] No story prefix in title — cannot dedupe: {issue_data.title}"
                        )
                    self.print_info(f"[{issue_number}] Would {verb} issue: {issue_data.title}")
                if self.verbose:
                    self.print_verbose(f"  Labels: {', '.join(issue_data.labels) if issue_data.labels else 'None'}")
                    self.print_verbose(f"  Milestone: {issue_data.milestone or 'None'}")
                    body_preview = issue_data.body[:100] + "..." if len(issue_data.body) > 100 else issue_data.body
                    self.print_verbose(f"  Body preview: {body_preview}")
                return True, ('updated' if existing else 'created')

            # Resolve milestone (creates if needed) for both create and update paths.
            milestone = None
            if issue_data.milestone:
                milestone = self.get_or_create_milestone(issue_data.milestone)

            if existing:
                existing.edit(
                    title=issue_data.title,
                    body=issue_data.body,
                    labels=issue_data.labels,
                    milestone=milestone,
                )
                self.print_success(
                    f"[{issue_number}] Updated issue #{existing.number} ({prefix}): {issue_data.title}"
                )
                if self.verbose:
                    self.print_verbose(f"  URL: {existing.html_url}")
                    self.print_verbose(f"  Labels: {', '.join(issue_data.labels) if issue_data.labels else 'None'}")
                    self.print_verbose(f"  Milestone: {issue_data.milestone or 'None'}")
                return True, 'updated'

            if not prefix:
                self.print_warning(
                    f"[{issue_number}] No story prefix in title — cannot dedupe, creating new: {issue_data.title}"
                )

            created_issue = self.repo.create_issue(
                title=issue_data.title,
                body=issue_data.body,
                labels=issue_data.labels,
                milestone=milestone
            )
            # Add to the index so a duplicate row later in the same CSV updates this issue.
            if prefix:
                self.existing_issues_by_prefix[prefix] = created_issue

            self.print_success(f"[{issue_number}] Created issue #{created_issue.number}: {issue_data.title}")
            if self.verbose:
                self.print_verbose(f"  URL: {created_issue.html_url}")
                self.print_verbose(f"  Labels: {', '.join([label.name for label in created_issue.labels])}")
                if created_issue.milestone:
                    self.print_verbose(f"  Milestone: {created_issue.milestone.title}")

            return True, 'created'

        except GithubException as e:
            self.print_error(f"[{issue_number}] GitHub API error on issue '{issue_data.title}': {e.data.get('message', str(e))}")
            return False, 'error'
        except Exception as e:
            self.print_error(f"[{issue_number}] Unexpected error on issue '{issue_data.title}': {str(e)}")
            return False, 'error'
    
    def parse_csv_file(self, csv_file_path: str) -> List[IssueData]:
        """Parse CSV file and return list of IssueData objects"""
        issues = []
        
        try:
            self.print_info(f"Parsing CSV file: {csv_file_path}")
            
            with open(csv_file_path, 'r', encoding='utf-8') as csvfile:
                # Detect delimiter
                sample = csvfile.read(4096)
                csvfile.seek(0)
                sniffer = csv.Sniffer()
                delimiter = sniffer.sniff(sample).delimiter
                
                self.print_verbose(f"Detected CSV delimiter: '{delimiter}'")
                
                reader = csv.DictReader(csvfile, delimiter=delimiter)
                
                # Validate required columns
                required_columns = {'Title', 'Body', 'Labels', 'Milestone'}
                missing_columns = required_columns - set(reader.fieldnames)
                if missing_columns:
                    self.print_error(f"Missing required columns: {', '.join(missing_columns)}")
                    self.print_error(f"Available columns: {', '.join(reader.fieldnames)}")
                    return []
                
                for row_num, row in enumerate(reader, start=1):
                    # Skip rows with empty titles
                    title = row.get('Title', '').strip()
                    if not title:
                        self.print_warning(f"Row {row_num}: Skipping row with empty title")
                        continue
                    
                    issue_data = IssueData(
                        title=title,
                        body=row.get('Body', '').strip(),
                        labels=row.get('Labels', '').strip(),
                        milestone=row.get('Milestone', '').strip() or None
                    )
                    
                    issues.append(issue_data)
                    self.print_verbose(f"Parsed issue {len(issues)}: {issue_data.title}")
            
            self.print_success(f"Successfully parsed {len(issues)} issues from CSV")
            return issues
            
        except FileNotFoundError:
            self.print_error(f"CSV file not found: {csv_file_path}")
            return []
        except csv.Error as e:
            self.print_error(f"CSV parsing error: {str(e)}")
            return []
        except Exception as e:
            self.print_error(f"Unexpected error parsing CSV: {str(e)}")
            return []
    
    def import_issues(self, csv_file_path: str) -> bool:
        """Main import process"""
        # Initialize repository connection
        if not self.initialize_repo():
            return False

        # Build the prefix → existing-issue index so we can update in place
        # instead of creating duplicates on re-runs.
        if not self.build_existing_prefix_index():
            return False

        # Parse CSV file
        issues = self.parse_csv_file(csv_file_path)
        if not issues:
            self.print_error("No valid issues found to import")
            return False

        self.stats['total_issues'] = len(issues)

        # Import issues
        self.print_info(f"Starting import of {len(issues)} issues...")
        if self.dry_run:
            self.print_warning("DRY RUN MODE - No issues will be created or updated")

        for i, issue_data in enumerate(issues, start=1):
            ok, action = self.create_or_update_issue(issue_data, i)
            if not ok:
                self.stats['errors'] += 1
            elif action == 'updated':
                self.stats['updated_issues'] += 1
            else:
                self.stats['created_issues'] += 1

            # Rate limiting - be nice to the API
            if not self.dry_run:
                time.sleep(0.5)  # 0.5 second delay between requests

        # Print summary
        self.print_summary()
        return self.stats['errors'] == 0
    
    def print_summary(self):
        """Print import summary statistics"""
        print()
        self.print_info("=== IMPORT SUMMARY ===")
        self.print_info(f"Repository: {self.repo_name}")
        self.print_info(f"Total issues processed: {self.stats['total_issues']}")
        self.print_success(f"Created: {self.stats['created_issues']}")
        self.print_success(f"Updated: {self.stats['updated_issues']}")

        if self.stats['created_milestones'] > 0:
            self.print_success(f"Milestones created: {self.stats['created_milestones']}")
        
        if self.stats['errors'] > 0:
            self.print_error(f"Errors encountered: {self.stats['errors']}")
        
        if self.dry_run:
            print()
            self.print_warning("This was a dry run. To actually create issues, run without --dry-run flag.")
        
        print()
        if self.stats['errors'] == 0:
            self.print_success("Import completed successfully!")
        else:
            self.print_warning("Import completed with errors. Please review the output above.")

def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Import GitHub issues from CSV file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --repo myusername/myrepo --token ghp_xxxxxxxxxxxxxxxxxxxx
  %(prog)s -r myusername/myrepo -t $GITHUB_TOKEN --dry-run --verbose
  %(prog)s -r myusername/myrepo -t $GITHUB_TOKEN -f custom_backlog.csv

CSV Format:
  The CSV file must contain these columns:
  - Title: Issue title (required)
  - Body: Issue description/body (optional)
  - Labels: Comma-separated labels (optional)
  - Milestone: Milestone name (optional)

Environment Variables:
  GITHUB_TOKEN: Can be used instead of --token parameter
        """)
    
    parser.add_argument('-r', '--repo', required=True,
                        help='GitHub repository (format: owner/repo)')
    parser.add_argument('-t', '--token',
                        help='GitHub personal access token (or set GITHUB_TOKEN env var)')
    parser.add_argument('-f', '--file', default='flowatch_backlog.csv',
                        help='CSV file path (default: flowatch_backlog.csv)')
    parser.add_argument('-d', '--dry-run', action='store_true',
                        help='Show what would be created without actually creating issues')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Enable verbose output')
    
    args = parser.parse_args()
    
    # Get token from argument or environment
    token = args.token or os.environ.get('GITHUB_TOKEN')
    if not token:
        print(f"{Colors.RED}[ERROR]{Colors.NC} GitHub token is required.")
        print(f"{Colors.BLUE}[INFO]{Colors.NC} Provide it via --token argument or GITHUB_TOKEN environment variable")
        print(f"{Colors.BLUE}[INFO]{Colors.NC} Create a token at: https://github.com/settings/tokens")
        print(f"{Colors.BLUE}[INFO]{Colors.NC} Required permissions: repo (Full control of private repositories)")
        sys.exit(1)
    
    # Validate file exists
    if not os.path.isfile(args.file):
        print(f"{Colors.RED}[ERROR]{Colors.NC} CSV file not found: {args.file}")
        sys.exit(1)
    
    # Create importer and run
    importer = GitHubImporter(
        repo_name=args.repo,
        token=token,
        dry_run=args.dry_run,
        verbose=args.verbose
    )
    
    try:
        success = importer.import_issues(args.file)
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}[WARNING]{Colors.NC} Import interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"{Colors.RED}[ERROR]{Colors.NC} Unexpected error: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()