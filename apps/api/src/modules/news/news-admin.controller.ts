import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  RequireAnyScopedPermission,
  RequirePermission,
} from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminNewsDto,
  AdminNewsListDto,
  AdminNewsListQueryDto,
  CreateNewsCategoryDto,
  NewsCategoryDto,
  NewsCategoryListDto,
  NewsHistoryDto,
  NewsInputDto,
  NewsTransitionDto,
  UpdateNewsCategoryDto,
} from './news.dto';
import { NEWS_STAFF, NewsAdminService } from './news-admin.service';
import { NewsCategoriesService } from './news-categories.service';

/**
 * News editing and review (API_DESIGN.md §4 "/admin/news"). Writing needs news.create; the
 * transition endpoint checks the permission each action needs (review, publish). Admin roles
 * apply only in a session that completed MFA. Audited by the service.
 *
 * An item is an organisation's or the platform's own, and so is the right to work on it (M16):
 * the service checks the owner on every route, and another owner's item reads as "not found".
 * The categories are the platform's.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/news')
@RequireAnyScopedPermission(...NEWS_STAFF)
export class NewsAdminController {
  constructor(
    private readonly news: NewsAdminService,
    private readonly categories: NewsCategoriesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AdminNewsListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AdminNewsListQueryDto,
  ): Promise<AdminNewsListDto> {
    return this.news.list(principalOf(req), query);
  }

  // Category routes come before ':id' so "categories" is never read as an ID.
  @Get('categories')
  @ApiOkResponse({ type: NewsCategoryListDto })
  async listCategories(): Promise<NewsCategoryListDto> {
    return { items: await this.categories.list(false) };
  }

  @Post('categories')
  @RequirePermission('news.review')
  @ApiCreatedResponse({ type: NewsCategoryDto })
  createCategory(@Body() body: CreateNewsCategoryDto): Promise<NewsCategoryDto> {
    return this.categories.create(body);
  }

  @Patch('categories/:id')
  @RequirePermission('news.review')
  @ApiOkResponse({ type: NewsCategoryDto })
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateNewsCategoryDto,
  ): Promise<NewsCategoryDto> {
    return this.categories.update(id, body);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminNewsDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: NewsInputDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminNewsDto> {
    return withEtag(res, await this.news.create(body, principalOf(req), meta));
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminNewsDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminNewsDto> {
    return withEtag(res, await this.news.get(principalOf(req), id));
  }

  @Put(':id')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The version you edited: "<n>"' })
  @ApiOkResponse({ type: AdminNewsDto })
  async update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NewsInputDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminNewsDto> {
    return withEtag(res, await this.news.update(id, body, ifMatch, principalOf(req), meta));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.news.remove(id, principalOf(req), meta);
  }

  @Post(':id/revision')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminNewsDto })
  async revision(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminNewsDto> {
    return withEtag(res, await this.news.createRevision(id, principalOf(req), meta));
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminNewsDto })
  async transition(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NewsTransitionDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminNewsDto> {
    return withEtag(res, await this.news.transition(id, body, principalOf(req), meta));
  }

  @Get(':id/history')
  @ApiOkResponse({ type: NewsHistoryDto })
  history(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NewsHistoryDto> {
    return this.news.history(principalOf(req), id);
  }
}

function withEtag(res: Response, item: AdminNewsDto): AdminNewsDto {
  res.setHeader('ETag', `"${item.version}"`);
  return item;
}
