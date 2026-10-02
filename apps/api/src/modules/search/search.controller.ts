import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { PrincipalResolver } from '../../common/auth/principal';
import { Public } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { SearchQueryDto, SearchResultsDto } from './search.dto';
import { SearchService } from './search.service';

/**
 * Global search. Open to everyone; a signed-in reader also finds what their membership lets
 * them open, and active members find listed members. Limited to 60 searches a minute per
 * address, and per person when signed in; a search for members also counts toward the
 * directory's limit.
 */
@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(
    private readonly searches: SearchService,
    private readonly principals: PrincipalResolver,
    private readonly limits: RateLimitStore,
  ) {}

  @Get()
  @Public()
  @RateLimit(RATE_LIMITS.searchPerIp)
  @ApiOkResponse({ type: SearchResultsDto })
  async search(
    @Req() req: Request,
    @Query() query: SearchQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SearchResultsDto> {
    const principal = await this.principals.resolve(req);
    if (principal) {
      await hitUserLimit(this.limits, RATE_LIMITS.searchPerUser, principal.userId, res);
      if (!query.types || query.types.includes('members')) {
        await hitUserLimit(this.limits, RATE_LIMITS.directoryPerUser, principal.userId, res);
      }
    }
    return this.searches.search(principal, query);
  }
}
