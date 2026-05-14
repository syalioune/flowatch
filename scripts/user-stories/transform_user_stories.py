#!/usr/bin/env python3
"""
Transform user stories from markdown files to CSV format.

This script reads user story markdown files and converts them to a CSV format
"""

import os
import re
import csv
import glob
from pathlib import Path


def parse_markdown_file(file_path):
    """Parse a markdown user story file and extract relevant information."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract title from first heading
    title_match = re.search(r'^# (.+?)$', content, re.MULTILINE)
    title = title_match.group(1) if title_match else ""
    
    # Extract user story components
    persona_match = re.search(r'\*\*Persona\*\*:\s*(.+)', content)
    persona = persona_match.group(1) if persona_match else ""
    
    # Extract "As... I want... So that..." pattern
    user_story_match = re.search(r'As (.+?),\s*\nI want (.+?),\s*\nSo that (.+?)\.', content, re.DOTALL)
    
    # Extract acceptance criteria
    ac_section = re.search(r'## Acceptance Criteria:(.+?)(?=##|$)', content, re.DOTALL)
    acceptance_criteria = []
    if ac_section:
        ac_lines = ac_section.group(1).strip().split('\n')
        for line in ac_lines:
            if line.strip().startswith('- AC'):
                acceptance_criteria.append(line.strip()[2:].strip())  # Remove "- " prefix
    
    # Extract definition of done
    dod_section = re.search(r'## Definition of Done:(.+?)(?=\*\*Labels\*\*|$)', content, re.DOTALL)
    definition_of_done = []
    if dod_section:
        dod_lines = dod_section.group(1).strip().split('\n')
        for line in dod_lines:
            if line.strip().startswith('- '):
                definition_of_done.append(line.strip()[2:])  # Remove "- " prefix
    
    # Extract labels
    labels_match = re.search(r'\*\*Labels\*\*:\s*(.+)', content)
    labels_raw = labels_match.group(1) if labels_match else ""
    
    # Extract milestone
    milestone_match = re.search(r'\*\*Milestone\*\*:\s*(.+)', content)
    milestone = milestone_match.group(1) if milestone_match else ""
    
    # Build the body content
    body_parts = []
    
    if user_story_match:
        body_parts.append(f"As {user_story_match.group(1)}")
        body_parts.append(f"I want {user_story_match.group(2)}")
        body_parts.append(f"So that {user_story_match.group(3)}")
        body_parts.append("")
    
    if acceptance_criteria:
        body_parts.append("Acceptance Criteria:")
        for ac in acceptance_criteria:
            body_parts.append(f"- {ac}")
        body_parts.append("")
    
    if definition_of_done:
        body_parts.append("Definition of Done:")
        for dod in definition_of_done:
            body_parts.append(f"- {dod}")
    
    body = "\n".join(body_parts)
    
    return {
        'title': title,
        'body': body,
        'labels': labels_raw,
        'milestone': milestone
    }


def extract_story_priority_size(labels_str):
    """Extract priority and size from labels string and convert to story points."""
    
    # Extract size
    size_match = re.search(r'size:([A-Z]+)', labels_str)
    size = size_match.group(1) if size_match else 'M'  # default to M
    
    # Extract priority
    priority_match = re.search(r'priority:(\w+)', labels_str)
    priority = priority_match.group(1) if priority_match else 'medium'
    
    return labels_str


def main():
    """Main function to process all user story files."""
    # Define paths (Flowatch convention — see scripts/user-stories/README.md)
    user_stories_dir = Path('docs/specifications/user-stories')
    output_file = Path('docs/specifications/user-stories/flowatch_backlog.csv')
    
    # Ensure output directory exists
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Get all markdown files
    md_files = list(user_stories_dir.glob('*.md'))
    
    if not md_files:
        print(f"No markdown files found in {user_stories_dir}")
        return
    
    print(f"Found {len(md_files)} user story files")
    
    # Process files and collect data
    csv_data = []
    
    for md_file in sorted(md_files):
        print(f"Processing: {md_file.name}")
        try:
            story_data = parse_markdown_file(md_file)
            
            # Add story points to labels if not present
            story_data['labels'] = extract_story_priority_size(story_data['labels'])
            
            csv_data.append([
                story_data['title'],
                story_data['body'],
                story_data['labels'],
                story_data['milestone']
            ])
            
        except Exception as e:
            print(f"Error processing {md_file.name}: {e}")
            continue
    
    # Write CSV file
    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        
        # Write header
        writer.writerow(['Title', 'Body', 'Labels', 'Milestone'])
        
        # Write data
        writer.writerows(csv_data)
    
    print(f"\nTransformation complete!")
    print(f"Output written to: {output_file}")
    print(f"Processed {len(csv_data)} user stories")


if __name__ == '__main__':
    main()