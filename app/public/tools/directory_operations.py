#!/usr/bin/env python3
"""
Directory Operations Tool - Directory management for GeminiGUI
Supports listing, creating, and deleting directories
"""

import sys
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, cast


def register():
    """
    Register this tool with the framework
    Returns tool metadata that AI will use to understand capabilities
    """
    return {
        'name': 'directory_operations',
        'docs': 'Directory operations: list contents, create directories, delete directories, and get directory info',
        'usage': '''
Usage:
  List directory:
    directory_operations {"operation": "list", "path": "src/"}
    
  Create directory:
    directory_operations {"operation": "create", "path": "src/new_folder"}
    
  Delete directory:
    directory_operations {"operation": "delete", "path": "src/old_folder"}
    
  Get directory info:
    directory_operations {"operation": "info", "path": "src/"}
    
  Search files:
    directory_operations {"operation": "search", "path": "src/", "pattern": "*.py"}

Parameters:
  - operation: One of ["list", "create", "delete", "info", "search"]
  - path: Directory path (required)
  - recursive: For list/search, include subdirectories (default: false)
  - pattern: For search, file pattern (e.g., "*.py", "*.txt")

Returns:
  - success: Boolean indicating success
  - data: Operation result (file list, directory info, etc.)
  - error: Error message if operation failed
        ''',
        'examples': [
            '{"operation": "list", "path": "src/"}',
            '{"operation": "create", "path": "src/components"}',
            '{"operation": "delete", "path": "temp/"}',
            '{"operation": "info", "path": "."}',
            '{"operation": "search", "path": "src/", "pattern": "*.tsx", "recursive": true}',
        ],
        'parameters': [
            {
                'name': 'operation',
                'type': 'string',
                'description': 'Operation to perform: list, create, delete, info, search',
                'required': True
            },
            {
                'name': 'path',
                'type': 'string',
                'description': 'Directory path (relative or absolute)',
                'required': True
            },
            {
                'name': 'recursive',
                'type': 'boolean',
                'description': 'Include subdirectories (for list/search)',
                'required': False,
                'default': False
            },
            {
                'name': 'pattern',
                'type': 'string',
                'description': 'File pattern for search (e.g., *.py)',
                'required': False
            }
        ],
        'responseSchema': {
            'type': 'object',
            'description': 'Operation result',
            'properties': {
                'success': {
                    'type': 'boolean',
                    'description': 'Whether operation succeeded'
                },
                'data': {
                    'type': 'object',
                    'description': 'Operation result data'
                },
                'error': {
                    'type': 'string',
                    'description': 'Error message if failed'
                }
            }
        },
        'version': '1.0.0'
    }


def list_directory_operation(path: str, recursive: bool = False) -> dict:
    """List directory contents"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'Directory not found: {path}'}
        
        if not os.path.isdir(path):
            return {'success': False, 'error': f'Not a directory: {path}'}
        
        items: List[Dict[str, Any]] = []
        
        if recursive:
            # Recursive walk
            for root, dirs, files in os.walk(path):
                for name in dirs:
                    full_path = os.path.join(root, name)
                    rel_path = os.path.relpath(full_path, path)
                    items.append({
                        'name': name,
                        'path': rel_path,
                        'type': 'directory'
                    })
                for name in files:
                    full_path = os.path.join(root, name)
                    rel_path = os.path.relpath(full_path, path)
                    size = os.path.getsize(full_path)
                    items.append({
                        'name': name,
                        'path': rel_path,
                        'type': 'file',
                        'size': size
                    })
        else:
            # Single level listing
            for entry in os.scandir(path):
                item = cast(Dict[str, Any], {
                    'name': entry.name,
                    'path': entry.path,
                    'type': 'directory' if entry.is_dir() else 'file'
                })
                if entry.is_file():
                    item['size'] = entry.stat().st_size
                items.append(item)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'items': items,
                'count': len(items),
                'recursive': recursive
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'List error: {str(e)}'}


def create_directory_operation(path: str) -> dict:
    """Create new directory"""
    try:
        if os.path.exists(path):
            return {'success': False, 'error': f'Directory already exists: {path}'}
        
        os.makedirs(path, exist_ok=False)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'absolute_path': os.path.abspath(path),
                'message': 'Directory created successfully'
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Create error: {str(e)}'}


def delete_directory_operation(path: str) -> dict:
    """Delete directory and its contents"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'Directory not found: {path}'}
        
        if not os.path.isdir(path):
            return {'success': False, 'error': f'Not a directory: {path}'}
        
        # Count items before deletion
        total_items = sum([len(files) + len(dirs) for _, dirs, files in os.walk(path)])
        
        shutil.rmtree(path)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'items_deleted': total_items,
                'message': 'Directory deleted successfully'
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Delete error: {str(e)}'}


def info_directory_operation(path: str) -> dict:
    """Get directory information"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'Directory not found: {path}'}
        
        if not os.path.isdir(path):
            return {'success': False, 'error': f'Not a directory: {path}'}
        
        # Count files and directories
        file_count = 0
        dir_count = 0
        total_size = 0
        
        for entry in os.scandir(path):
            if entry.is_file():
                file_count += 1
                total_size += entry.stat().st_size
            elif entry.is_dir():
                dir_count += 1
        
        stat = os.stat(path)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'absolute_path': os.path.abspath(path),
                'file_count': file_count,
                'directory_count': dir_count,
                'total_size': total_size,
                'modified': stat.st_mtime,
                'created': stat.st_ctime
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Info error: {str(e)}'}


def search_directory_operation(path: str, pattern: str, recursive: bool = False) -> dict:
    """Search for files matching pattern"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'Directory not found: {path}'}
        
        if not os.path.isdir(path):
            return {'success': False, 'error': f'Not a directory: {path}'}
        
        from fnmatch import fnmatch
        matches: List[Dict[str, Any]] = []
        
        if recursive:
            for root, dirs, files in os.walk(path):
                for name in files:
                    if fnmatch(name, pattern):
                        full_path = os.path.join(root, name)
                        rel_path = os.path.relpath(full_path, path)
                        size = os.path.getsize(full_path)
                        matches.append({
                            'name': name,
                            'path': rel_path,
                            'size': size
                        })
        else:
            for entry in os.scandir(path):
                if entry.is_file() and fnmatch(entry.name, pattern):
                    matches.append({
                        'name': entry.name,
                        'path': entry.path,
                        'size': entry.stat().st_size
                    })
        
        return {
            'success': True,
            'data': {
                'path': path,
                'pattern': pattern,
                'matches': matches,
                'count': len(matches),
                'recursive': recursive
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Search error: {str(e)}'}


def execute(params):
    """
    Execute the directory operation
    
    Args:
        params: Dictionary with operation, path, and operation-specific params
        
    Returns:
        Dictionary with success, data, or error
    """
    try:
        operation = params.get('operation', '').lower()
        path = params.get('path')
        
        if not path:
            return {'success': False, 'error': 'Missing required parameter: path'}
        
        if operation == 'list':
            recursive = params.get('recursive', False)
            return list_directory_operation(path, recursive)
        
        elif operation == 'create':
            return create_directory_operation(path)
        
        elif operation == 'delete':
            return delete_directory_operation(path)
        
        elif operation == 'info':
            return info_directory_operation(path)
        
        elif operation == 'search':
            pattern = params.get('pattern')
            if not pattern:
                return {'success': False, 'error': 'Search operation requires pattern parameter'}
            recursive = params.get('recursive', False)
            return search_directory_operation(path, pattern, recursive)
        
        else:
            return {
                'success': False,
                'error': f'Unknown operation: {operation}. Supported: list, create, delete, info, search'
            }
    
    except Exception as e:
        return {'success': False, 'error': f'Execution error: {str(e)}'}


def main():
    """
    Main entry point when called from command line
    """
    if len(sys.argv) < 2:
        # Print tool metadata (register mode)
        metadata = register()
        print(json.dumps(metadata, indent=2))
        sys.exit(0)
    
    # Parse parameters and execute
    try:
        params_json = sys.argv[1]
        params = json.loads(params_json)
        
        result = execute(params)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    
    except json.JSONDecodeError as e:
        error_response = {'success': False, 'error': f'Invalid JSON parameters: {str(e)}'}
        print(json.dumps(error_response))
        sys.exit(1)
    
    except Exception as e:
        error_response = {'success': False, 'error': f'Unexpected error: {str(e)}'}
        print(json.dumps(error_response))
        sys.exit(1)


if __name__ == '__main__':
    main()
