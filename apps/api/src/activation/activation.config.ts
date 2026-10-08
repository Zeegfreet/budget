import { ConfigService } from '@nestjs/config';
import { webUrlFrom } from '../config/web-url.js';

export const ACTIVATION_CONFIG = Symbol('ACTIVATION_CONFIG');

export interface ActivationConfig {
  /** How long an activation link lasts */
  ttlHours: number;
  /** How long a password reset link lasts */
  resetTtlMinutes: number;
  /** The web app, where the links land */
  webUrl: string;
}

export function activationConfigFactory(
  config: ConfigService,
): ActivationConfig {
  return {
    ttlHours: Number(config.get('ACTIVATION_TOKEN_TTL_HOURS') ?? 72),
    resetTtlMinutes: Number(
      config.get('PASSWORD_RESET_TOKEN_TTL_MINUTES') ?? 60,
    ),
    webUrl: webUrlFrom(config),
  };
}
