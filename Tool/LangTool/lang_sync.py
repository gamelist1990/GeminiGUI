#!/usr/bin/env python3
"""
Language Translation Sync Tool for GeminiGUI

This tool compares en_US.jsonc and ja_JP.jsonc translation files,
identifies missing Japanese translations, and adds them with English defaults.
"""

import json
import re
from pathlib import Path
import argparse


def load_jsonc(file_path):
    """Load a JSONC (JSON with comments) file by removing comments."""
    try:
        import json5
        # Use json5 if available (supports comments)
        with open(file_path, 'r', encoding='utf-8') as f:
            return json5.load(f)
    except ImportError:
        # Fallback to manual comment removal
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Simple comment removal - remove lines that start with // (after whitespace)
        lines = []
        for line in content.split('\n'):
            stripped = line.strip()
            if stripped.startswith('//'):
                continue
            lines.append(line)

        content = '\n'.join(lines)

        # Try to parse
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse {file_path} properly due to comments. Error: {e}")
            print("Trying to install json5 for better JSONC support...")
            print("Run: pip install json5")
            raise


def flatten_keys(data, prefix=''):
    """Flatten nested dictionary keys into dot-notation paths."""
    keys = {}
    for key, value in data.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            keys.update(flatten_keys(value, full_key))
        else:
            keys[full_key] = value
    return keys


def reconstruct_nested(data, keys_to_add):
    """Reconstruct nested dictionary from flattened key paths."""
    for key_path, value in keys_to_add.items():
        keys = key_path.split('.')
        current = data
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        current[keys[-1]] = value
    return data


def find_missing_translations(en_file, ja_file):
    """Find keys that exist in English but are missing in Japanese."""
    en_data = load_jsonc(en_file)
    ja_data = load_jsonc(ja_file)

    en_keys = flatten_keys(en_data)
    ja_keys = flatten_keys(ja_data)

    missing_keys = {}
    for key in en_keys:
        if key not in ja_keys:
            missing_keys[key] = en_keys[key]

    return missing_keys


def add_missing_translations_to_file(ja_file, missing_keys):
    """Add missing translations to the Japanese file."""
    ja_data = load_jsonc(ja_file)

    # Reconstruct nested structure from missing keys
    ja_data = reconstruct_nested(ja_data, missing_keys)

    # Write back to file with proper formatting and comments
    with open(ja_file, 'r', encoding='utf-8') as f:
        original_content = f.read()

    # Find the position to insert (before the last closing brace)
    lines = original_content.split('\n')
    last_brace_index = -1
    for i in range(len(lines) - 1, -1, -1):
        if '}' in lines[i] and '{' not in lines[i]:
            last_brace_index = i
            break

    if last_brace_index == -1:
        print("Could not find closing brace in Japanese file")
        return

    # For now, just write the updated JSON without preserving comments structure
    # A more sophisticated approach would preserve the comment structure
    with open(ja_file, 'w', encoding='utf-8') as f:
        json.dump(ja_data, f, ensure_ascii=False, indent=2)

    print(f"Updated {ja_file} with {len(missing_keys)} missing translations")


def main():
    parser = argparse.ArgumentParser(description='Sync translation files')
    parser.add_argument('--check-only', action='store_true',
                       help='Only check for missing translations without modifying files')
    parser.add_argument('--en-file', default='app/public/lang/en_US.jsonc',
                       help='Path to English translation file')
    parser.add_argument('--ja-file', default='app/public/lang/ja_JP.jsonc',
                       help='Path to Japanese translation file')

    args = parser.parse_args()

    en_file = Path(args.en_file)
    ja_file = Path(args.ja_file)

    if not en_file.exists():
        print(f"English file not found: {en_file}")
        return

    if not ja_file.exists():
        print(f"Japanese file not found: {ja_file}")
        return

    # Find missing translations
    missing_keys = find_missing_translations(en_file, ja_file)

    if not missing_keys:
        print("No missing translations found. All keys are properly translated.")
        return

    print(f"Found {len(missing_keys)} missing Japanese translations:")
    for key in sorted(missing_keys.keys()):
        print(f"  {key}: '{missing_keys[key]}'")

    if args.check_only:
        print("\nUse without --check-only to add missing translations.")
        return

    # Confirm before adding
    response = input(f"\nAdd {len(missing_keys)} missing translations to Japanese file? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled.")
        return

    add_missing_translations_to_file(ja_file, missing_keys)


if __name__ == '__main__':
    main()