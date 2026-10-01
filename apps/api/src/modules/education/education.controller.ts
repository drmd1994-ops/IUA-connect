import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import {
  PrincipalResolver,
  type RequestWithPrincipal,
  principalOf,
} from '../../common/auth/principal';
import { Public, RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminEducationDto,
  AdminEducationListDto,
  AdminEducationListQueryDto,
  CourseLessonsDto,
  EducationHistoryDto,
  EducationInputDto,
  EducationTransitionDto,
  PublicEducationDto,
  PublicEducationItemQueryDto,
  PublicEducationListDto,
  PublicEducationQueryDto,
} from './education.dto';
import { EducationAdminService } from './education-admin.service';
import { EducationPublicService } from './education-public.service';

/**
 * Education items in the admin area (API_DESIGN.md §4 "/admin/education"). Writing needs
 * education.manage; the transition endpoint checks the permission each step needs (reviewing is
 * education.review). Admin roles apply only in a session that completed MFA.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/education')
@RequirePermission('education.manage')
export class EducationAdminController {
  constructor(private readonly education: EducationAdminService) {}

  @Get()
  @ApiOkResponse({ type: AdminEducationListDto })
  list(@Query() query: AdminEducationListQueryDto): Promise<AdminEducationListDto> {
    return this.education.list(query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminEducationDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: EducationInputDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEducationDto> {
    return withEtag(res, await this.education.create(body, principalOf(req), meta));
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminEducationDto })
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEducationDto> {
    return withEtag(res, await this.education.get(id));
  }

  @Put(':id')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The version you edited: "<n>"' })
  @ApiOkResponse({ type: AdminEducationDto })
  async update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EducationInputDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEducationDto> {
    return withEtag(res, await this.education.update(id, body, ifMatch, principalOf(req), meta));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.education.remove(id, principalOf(req), meta);
  }

  /** The ordered lessons of a course (replaces the list). */
  @Put(':id/lessons')
  @ApiOkResponse({ type: AdminEducationDto })
  async setLessons(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CourseLessonsDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEducationDto> {
    return withEtag(
      res,
      await this.education.setLessons(id, body.lessonIds, principalOf(req), meta),
    );
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminEducationDto })
  async transition(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EducationTransitionDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminEducationDto> {
    return withEtag(res, await this.education.transition(id, body, principalOf(req), meta));
  }

  @Get(':id/history')
  @ApiOkResponse({ type: EducationHistoryDto })
  history(@Param('id', new ParseUUIDPipe()) id: string): Promise<EducationHistoryDto> {
    return this.education.history(id);
  }
}

function withEtag(res: Response, item: AdminEducationDto): AdminEducationDto {
  res.setHeader('ETag', `"${item.version}"`);
  return item;
}

/**
 * The public education library (API_DESIGN.md §4). Open to everyone; signed-in members also see
 * what their membership allows (access tiers), so the caller is identified when a token is sent.
 */
@ApiTags('education')
@Controller('education')
@Public()
export class EducationPublicController {
  constructor(
    private readonly education: EducationPublicService,
    private readonly principals: PrincipalResolver,
  ) {}

  @Get()
  @ApiOkResponse({ type: PublicEducationListDto })
  async list(
    @Req() req: RequestWithPrincipal,
    @Query() query: PublicEducationQueryDto,
  ): Promise<PublicEducationListDto> {
    return this.education.list(await this.caller(req), query);
  }

  @Get(':slug')
  @ApiOkResponse({ type: PublicEducationDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PublicEducationItemQueryDto,
  ): Promise<PublicEducationDto> {
    return this.education.get(await this.caller(req), slug, query.locale);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}
