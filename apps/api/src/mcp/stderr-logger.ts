import { ConsoleLogger, type LogLevel } from '@nestjs/common';

/**
 * Nest's console logger writing every level to stderr: in the stdio process,
 * stdout carries only JSON-RPC messages.
 */
export class StderrLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    _writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    super.printMessages(messages, context, logLevel, 'stderr', errorStack);
  }
}
