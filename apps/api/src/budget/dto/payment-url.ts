import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { trimToNull } from './category.dto.js';

export const MAX_PAYMENT_URL_LENGTH = 2000;

/**
 * Optional link to the bill (boleto) or the portal where a launch is paid.
 * Only absolute http(s) URLs, so the web can render it as a plain link;
 * `null` (or a blank string) clears it.
 */
export const IsPaymentUrl = () =>
  applyDecorators(
    ApiPropertyOptional({
      type: String,
      nullable: true,
      maxLength: MAX_PAYMENT_URL_LENGTH,
      example: 'https://www.exemplo.com.br/boleto/123',
      description:
        'Link to the bill or payment portal (http/https); `null` removes it',
    }),
    IsOptional(),
    Transform(trimToNull),
    IsString(),
    MaxLength(MAX_PAYMENT_URL_LENGTH),
    IsUrl(
      { protocols: ['http', 'https'], require_protocol: true },
      { message: 'paymentUrl must be an http(s) URL' },
    ),
  );
