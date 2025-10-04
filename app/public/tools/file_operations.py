#!/usr/bin/env python3
"""
File Operations Tool - Advanced file manipulation for GeminiGUI
Supports reading, creating, and editing files with diff application
"""

import sys
import json
import os
import difflib
from pathlib import Path


def register():
    """
    Register this tool with the framework
    Returns tool metadata that AI will use to understand capabilities
    """
    return {
        'name': 'file_operations',
        'docs': 'Advanced file operations: read files, create new files, and apply diffs to existing files',
        'usage': '''
Usage:
  Read file:
    file_operations {"operation": "read", "path": "src/main.py"}
    
  Create file:
    file_operations {"operation": "create", "path": "src/new.py", "content": "print('Hello')"}
    
  Edit file (apply diff):
    file_operations {"operation": "edit", "path": "src/main.py", "old_content": "old text", "new_content": "new text"}
    
  List file info:
    file_operations {"operation": "info", "path": "src/main.py"}

Parameters:
  - operation: One of ["read", "create", "edit", "info"]
  - path: File path (required)
  - content: File content for create operation
  - old_content: Original text to replace (for edit)
  - new_content: New text to replace with (for edit)
  - encoding: File encoding (default: utf-8)

Returns:
  - success: Boolean indicating success
  - data: Operation result (file content, file info, etc.)
  - error: Error message if operation failed
        ''',
        'examples': [
            '{"operation": "read", "path": "README.md"}',
            '{"operation": "create", "path": "test.txt", "content": "Hello World"}',
            '{"operation": "edit", "path": "main.py", "old_content": "def old():", "new_content": "def new():"}',
            '{"operation": "info", "path": "package.json"}',
        ],
        'parameters': [
            {
                'name': 'operation',
                'type': 'string',
                'description': 'Operation to perform: read, create, edit, info',
                'required': True
            },
            {
                'name': 'path',
                'type': 'string',
                'description': 'File path (relative or absolute)',
                'required': True
            },
            {
                'name': 'content',
                'type': 'string',
                'description': 'File content (for create operation)',
                'required': False
            },
            {
                'name': 'old_content',
                'type': 'string',
                'description': 'Original text to replace (for edit operation)',
                'required': False
            },
            {
                'name': 'new_content',
                'type': 'string',
                'description': 'New text to replace with (for edit operation)',
                'required': False
            },
            {
                'name': 'encoding',
                'type': 'string',
                'description': 'File encoding (default: utf-8)',
                'required': False,
                'default': 'utf-8'
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


def read_file_operation(path: str, encoding: str = 'utf-8') -> dict:
    """Read file contents"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'File not found: {path}'}
        
        if not os.path.isfile(path):
            return {'success': False, 'error': f'Not a file: {path}'}
        
        with open(path, 'r', encoding=encoding) as f:
            content = f.read()
        
        file_size = os.path.getsize(path)
        line_count = content.count('\n') + 1
        
        return {
            'success': True,
            'data': {
                'content': content,
                'path': path,
                'size': file_size,
                'lines': line_count,
                'encoding': encoding
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Read error: {str(e)}'}


def create_file_operation(path: str, content: str, encoding: str = 'utf-8') -> dict:
    """Create new file with content"""
    try:
        if os.path.exists(path):
            return {'success': False, 'error': f'File already exists: {path}'}
        
        # Create parent directories if needed
        parent_dir = os.path.dirname(path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
        
        with open(path, 'w', encoding=encoding) as f:
            f.write(content)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'size': len(content.encode(encoding)),
                'lines': content.count('\n') + 1,
                'message': 'File created successfully'
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Create error: {str(e)}'}


def edit_file_operation(path: str, old_content: str, new_content: str, encoding: str = 'utf-8') -> dict:
    """Edit file by replacing old_content with new_content"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'File not found: {path}'}
        
        if not os.path.isfile(path):
            return {'success': False, 'error': f'Not a file: {path}'}
        
        # Read current content
        with open(path, 'r', encoding=encoding) as f:
            current_content = f.read()
        
        # Check if old_content exists
        if old_content not in current_content:
            return {
                'success': False,
                'error': 'Old content not found in file. Cannot apply diff.'
            }
        
        # Replace content
        new_file_content = current_content.replace(old_content, new_content, 1)
        
        # Generate diff for preview
        diff = list(difflib.unified_diff(
            current_content.splitlines(keepends=True),
            new_file_content.splitlines(keepends=True),
            fromfile=f'{path} (before)',
            tofile=f'{path} (after)',
            lineterm=''
        ))
        
        # Write new content
        with open(path, 'w', encoding=encoding) as f:
            f.write(new_file_content)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'diff': ''.join(diff),
                'old_size': len(current_content.encode(encoding)),
                'new_size': len(new_file_content.encode(encoding)),
                'message': 'File edited successfully'
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Edit error: {str(e)}'}


def info_file_operation(path: str) -> dict:
    """Get file information"""
    try:
        if not os.path.exists(path):
            return {'success': False, 'error': f'File not found: {path}'}
        
        stat = os.stat(path)
        
        return {
            'success': True,
            'data': {
                'path': path,
                'absolute_path': os.path.abspath(path),
                'size': stat.st_size,
                'is_file': os.path.isfile(path),
                'is_dir': os.path.isdir(path),
                'modified': stat.st_mtime,
                'created': stat.st_ctime,
                'extension': os.path.splitext(path)[1]
            }
        }
    except Exception as e:
        return {'success': False, 'error': f'Info error: {str(e)}'}


def execute(params):
    """
    Execute the file operation
    
    Args:
        params: Dictionary with operation, path, and operation-specific params
        
    Returns:
        Dictionary with success, data, or error
    """
    try:
        operation = params.get('operation', '').lower()
        path = params.get('path')
        encoding = params.get('encoding', 'utf-8')
        
        if not path:
            return {'success': False, 'error': 'Missing required parameter: path'}
        
        if operation == 'read':
            return read_file_operation(path, encoding)
        
        elif operation == 'create':
            content = params.get('content', '')
            return create_file_operation(path, content, encoding)
        
        elif operation == 'edit':
            old_content = params.get('old_content')
            new_content = params.get('new_content')
            
            if old_content is None or new_content is None:
                return {
                    'success': False,
                    'error': 'Edit operation requires old_content and new_content parameters'
                }
            
            return edit_file_operation(path, old_content, new_content, encoding)
        
        elif operation == 'info':
            return info_file_operation(path)
        
        else:
            return {
                'success': False,
                'error': f'Unknown operation: {operation}. Supported: read, create, edit, info'
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
