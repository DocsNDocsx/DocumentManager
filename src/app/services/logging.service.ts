import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

@Injectable({ providedIn: 'root' })
export class LoggingService {
  private readonly minLevel: LogLevel = environment.production ? LogLevel.WARN : LogLevel.DEBUG;

  private timestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.debug(`[${this.timestamp()}] [DEBUG]`, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.info(`[${this.timestamp()}] [INFO]`, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(`[${this.timestamp()}] [WARN]`, message, ...args);
  }

  error(message: string, error?: unknown): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    console.error(`[${this.timestamp()}] [ERROR]`, message, ...(error !== undefined ? [error] : []));
  }
}
