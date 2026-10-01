import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrincipalResolver, type RequestWithPrincipal } from '../../common/auth/principal';
import { Public } from '../../common/decorators/access.decorators';
import { NewsCategoryListDto } from './news.dto';
import {
  PublicNewsDto,
  PublicNewsItemQueryDto,
  PublicNewsListDto,
  PublicNewsQueryDto,
} from './news-public.dto';
import { NewsCategoriesService } from './news-categories.service';
import { NewsPublicService } from './news-public.service';

/**
 * Public news (API_DESIGN.md §4). Open to everyone; signed-in members also see what their
 * membership allows (access tiers), so the caller is identified when a token is sent.
 */
@ApiTags('news')
@Controller('news')
@Public()
export class NewsPublicController {
  constructor(
    private readonly news: NewsPublicService,
    private readonly categories: NewsCategoriesService,
    private readonly principals: PrincipalResolver,
  ) {}

  @Get()
  @ApiOkResponse({ type: PublicNewsListDto })
  async list(
    @Req() req: RequestWithPrincipal,
    @Query() query: PublicNewsQueryDto,
  ): Promise<PublicNewsListDto> {
    return this.news.list(await this.caller(req), query);
  }

  @Get('categories')
  @ApiOkResponse({ type: NewsCategoryListDto })
  async listCategories(): Promise<NewsCategoryListDto> {
    return { items: await this.categories.list(true) };
  }

  @Get(':slug')
  @ApiOkResponse({ type: PublicNewsDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PublicNewsItemQueryDto,
  ): Promise<PublicNewsDto> {
    return this.news.get(await this.caller(req), slug, query.locale);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}
