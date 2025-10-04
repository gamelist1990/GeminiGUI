/**
 * Streaming fetch implementation using Tauri's shell plugin
 * This bypasses CORS and provides true streaming support
 */
import { Command } from '@tauri-apps/plugin-shell';

export interface StreamingFetchOptions {
  method: string;
  headers: Record<string, string>;
  body: string;
  onChunk: (chunk: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Perform a streaming HTTP request using curl via Tauri shell
 */
export async function streamingFetch(
  url: string,
  options: StreamingFetchOptions
): Promise<void> {
  const { method, headers, body, onChunk, onError, onComplete } = options;

  // Build curl command arguments
  const args: string[] = [
    '-X', method,
    '-N', // No buffering
    '--no-buffer', // Disable buffering
  ];

  // Add headers
  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }

  // Add body for POST/PUT
  if (body && (method === 'POST' || method === 'PUT')) {
    args.push('-d', body);
  }

  // Add URL
  args.push(url);

  try {
    const command = Command.create('curl', args);

    // Handle stdout (streaming response)
    command.stdout.on('data', (line: string) => {
      if (line.trim()) {
        onChunk(line);
      }
    });

    // Handle stderr (errors)
    command.stderr.on('data', (line: string) => {
      console.error('[streamingFetch] stderr:', line);
      if (onError) {
        onError(line);
      }
    });

    // Execute command
    const output = await command.execute();

    if (output.code === 0) {
      if (onComplete) {
        onComplete();
      }
    } else {
      const errorMsg = `curl exited with code ${output.code}`;
      console.error('[streamingFetch]', errorMsg);
      if (onError) {
        onError(errorMsg);
      }
    }
  } catch (error) {
    console.error('[streamingFetch] error:', error);
    if (onError) {
      onError(String(error));
    }
    throw error;
  }
}
