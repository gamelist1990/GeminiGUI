#!/usr/bin/env python3
"""
Language Translation Sync Tool for GeminiGUI

This tool compares en_US.jsonc and ja_JP.jsonc translation files,
identifies missing Japanese translations, and adds them with English defaults.

Features:
- Check for missing translations (--check-only)
- Add missing translations interactively
- Auto-sync mode (--auto): Automatically sync, sort by English structure,
  add missing keys, and remove extra keys

Usage:
  python lang_sync.py --check-only  # Check only
  python lang_sync.py               # Interactive mode
  python lang_sync.py --auto        # Auto-sync mode
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


def find_extra_translations(en_file, ja_file):
    """Find keys that exist in Japanese but not in English."""
    en_data = load_jsonc(en_file)
    ja_data = load_jsonc(ja_file)

    en_keys = flatten_keys(en_data)
    ja_keys = flatten_keys(ja_data)

    extra_keys = {}
    for key in ja_keys:
        if key not in en_keys:
            extra_keys[key] = ja_keys[key]

    return extra_keys


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


def sort_by_en_structure(en_data, ja_data):
    """Sort Japanese translation data to match English structure."""
    def sort_dict_by_keys(data, key_order):
        """Recursively sort dictionary by key order."""
        if not isinstance(data, dict):
            return data

        sorted_data = {}
        # First, add keys in the order they appear in English
        for key in key_order:
            if key in data:
                if isinstance(data[key], dict) and key in key_order and isinstance(key_order[key], dict):
                    sorted_data[key] = sort_dict_by_keys(data[key], key_order[key])
                else:
                    sorted_data[key] = data[key]

        # Then add any remaining keys not in English (shouldn't happen in auto mode)
        for key in data:
            if key not in sorted_data:
                sorted_data[key] = data[key]

        return sorted_data

    # Get the structure/order from English data
    key_order = {}
    def build_key_order(data, prefix=''):
        result = {}
        for key, value in data.items():
            if isinstance(value, dict):
                result[key] = build_key_order(value, f"{prefix}.{key}" if prefix else key)
            else:
                result[key] = None
        return result

    en_key_order = build_key_order(en_data)
    return sort_dict_by_keys(ja_data, en_key_order)


def remove_extra_translations(ja_data, extra_keys):
    """Remove extra keys from Japanese data."""
    def remove_keys(data, keys_to_remove):
        if not isinstance(data, dict):
            return data

        keys_to_remove_at_this_level = []
        nested_keys_to_remove = {}

        for key_path in keys_to_remove:
            key_parts = key_path.split('.')
            if len(key_parts) == 1:
                keys_to_remove_at_this_level.append(key_parts[0])
            else:
                if key_parts[0] not in nested_keys_to_remove:
                    nested_keys_to_remove[key_parts[0]] = []
                nested_keys_to_remove[key_parts[0]].append('.'.join(key_parts[1:]))

        # Remove keys at this level
        for key in keys_to_remove_at_this_level:
            if key in data:
                del data[key]

        # Recursively remove nested keys
        for key, nested_keys in nested_keys_to_remove.items():
            if key in data and isinstance(data[key], dict):
                remove_keys(data[key], nested_keys)

        return data

    return remove_keys(ja_data.copy(), list(extra_keys.keys()))


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


def sync_translations_auto(en_file, ja_file):
    """Automatically sync Japanese translations with English structure."""
    en_data = load_jsonc(en_file)
    ja_data = load_jsonc(ja_file)

    # Find missing and extra translations
    missing_keys = find_missing_translations(en_file, ja_file)
    extra_keys = find_extra_translations(en_file, ja_file)

    # Remove extra keys
    if extra_keys:
        ja_data = remove_extra_translations(ja_data, extra_keys)
        print(f"Removed {len(extra_keys)} extra keys from Japanese file")

    # Add missing keys
    if missing_keys:
        ja_data = reconstruct_nested(ja_data, missing_keys)
        print(f"Added {len(missing_keys)} missing keys to Japanese file")

    # Sort by English structure
    ja_data = sort_by_en_structure(en_data, ja_data)
    print("Sorted Japanese file to match English structure")

    # Write back to file
    with open(ja_file, 'w', encoding='utf-8') as f:
        json.dump(ja_data, f, ensure_ascii=False, indent=2)

    total_changes = len(missing_keys) + len(extra_keys)
    if total_changes > 0:
        print(f"Auto-sync completed: {total_changes} changes made")
    else:
        print("Auto-sync completed: No changes needed")


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
    parser.add_argument('--auto', action='store_true',
                       help='Automatically sync, sort by English structure, add missing keys, and remove extra keys')
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

    # Auto mode: full synchronization
    if args.auto:
        print("Running in auto mode...")
        sync_translations_auto(en_file, ja_file)
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