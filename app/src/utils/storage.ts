import { Settings, Workspace } from '../types';
import { Config } from './configAPI';

// Delegate to Config class (file-backed storage)
const config = new Config('C:\\Users\\issei\\Documents\\PEXData\\GeminiGUI');

export function saveSettings(settings: Settings): void {
  // fire-and-forget async write
  void config.saveConfig(settings);
}

export function loadSettings(): Settings | null {
  // synchronous fallback: attempt to return null and let callers use async Config where available
  return null;
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  void config.saveWorkspaces(workspaces);
}

export function loadWorkspaces(): Workspace[] {
  // synchronous wrapper is not available; return empty and let hooks use async Config
  return [];
}

export function formatElapsedTime(startTime: Date): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();

  if (diff < 0) {
    return '0s'; // Future date, show 0
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // More accurate month and year calculation
  const startDate = new Date(startTime);
  const currentDate = new Date(now);

  let years = currentDate.getFullYear() - startDate.getFullYear();
  let months = currentDate.getMonth() - startDate.getMonth();

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  // If the day hasn't passed yet this month, subtract one month
  if (currentDate.getDate() < startDate.getDate()) {
    months--;
    if (months < 0) {
      years--;
      months += 12;
    }
  }

  if (years > 0) {
    return months > 0 ? `${years}y ${months}m` : `${years}y`;
  } else if (months > 0) {
    const remainingDays = days - (months * 30) - (years * 365); // Approximate remaining days
    return remainingDays > 0 ? `${months}m ${remainingDays}d` : `${months}m`;
  } else if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

export function formatNumber(num: number): string {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  } else {
    return num.toString();
  }
}
