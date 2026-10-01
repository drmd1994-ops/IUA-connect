import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrincipalResolver, type RequestWithPrincipal } from '../../common/auth/principal';
import { Public } from '../../common/decorators/access.decorators';
import {
  PublicGuidelineDto,
  PublicGuidelineItemQueryDto,
  PublicGuidelineListDto,
  PublicGuidelineQueryDto,
} from './guidelines.dto';
import { GuidelinesService } from './guidelines.service';

/**
 * Public guidelines (API_DESIGN.md §4). Open to everyone; signed-in members also see what their
 * membership allows (access tiers), so the caller is identified when a token is sent.
 */
@ApiTags('guidelines')
@Controller('guidelines')
@Public()
export class GuidelinesPublicController {
  constructor(
    private readonly guidelines: GuidelinesService,
    private readonly principals: PrincipalResolver,
  ) {}

  @Get()
  @ApiOkResponse({ type: PublicGuidelineListDto })
  async list(
    @Req() req: RequestWithPrincipal,
    @Query() query: PublicGuidelineQueryDto,
  ): Promise<PublicGuidelineListDto> {
    return this.guidelines.list(await this.caller(req), query);
  }

  @Get(':id')
  @ApiOkResponse({ type: PublicGuidelineDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PublicGuidelineItemQueryDto,
  ): Promise<PublicGuidelineDto> {
    return this.guidelines.get(await this.caller(req), id, query.locale);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}
