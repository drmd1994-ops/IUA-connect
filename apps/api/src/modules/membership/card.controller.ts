import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../common/dto/nullable-string';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, Public } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import {
  OrganisationQueryDto,
  OrganisationsService,
  organisationRefSchema,
} from '../organisations';
import { CardService } from './card.service';

export class CardTokenDto extends createZodDto(
  z.strictObject({ token: z.string(), expiresAt: z.iso.datetime() }),
) {}

export class CardVerifyQueryDto extends createZodDto(
  z.strictObject({ t: z.string().min(1).max(2048) }),
) {}

/** Only valid/invalid, the name, the organisation and the membership type (API_DESIGN.md §4). */
export class CardVerificationDto extends createZodDto(
  z.strictObject({
    valid: z.boolean(),
    name: nullableString(),
    /** Whose card it is: the organisation the membership is in. */
    organisation: organisationRefSchema.nullable(),
    type: z.strictObject({ key: z.string(), nameHe: z.string(), nameEn: z.string() }).nullable(),
  }),
) {}

/** The member's QR token (refreshed by the card page before it expires). */
@ApiTags('membership')
@ApiBearerAuth()
@Controller('me/membership/card-token')
@Authenticated()
export class CardTokenController {
  constructor(
    private readonly cards: CardService,
    private readonly organisations: OrganisationsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CardTokenDto })
  async issue(
    @Req() req: RequestWithPrincipal,
    @Query() query: OrganisationQueryDto,
  ): Promise<CardTokenDto> {
    const { userId } = principalOf(req);
    return this.cards.issue(
      userId,
      await this.organisations.meantForMember(query.organisation, userId),
    );
  }
}

/** Public verification of a scanned card (rate-limited per IP, API_DESIGN.md §5). */
@ApiTags('membership')
@Controller('card/verify')
@Public()
export class CardVerifyController {
  constructor(private readonly cards: CardService) {}

  @Get()
  @RateLimit(RATE_LIMITS.cardVerifyPerIp)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CardVerificationDto })
  verify(@Query() query: CardVerifyQueryDto): Promise<CardVerificationDto> {
    return this.cards.verify(query.t);
  }
}
