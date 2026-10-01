import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminGuidelineDto,
  AdminGuidelineListDto,
  AdminGuidelineListQueryDto,
  CreateGuidelineDto,
  GuidelineVersionInputDto,
  UpdateGuidelineDto,
} from './guidelines.dto';
import { GuidelinesService } from './guidelines.service';

/**
 * Guideline management (API_DESIGN.md §4 "/admin/guidelines"). Needs guidelines.manage, which
 * applies only in a session that completed MFA. Audited by the service.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/guidelines')
@RequirePermission('guidelines.manage')
export class GuidelinesAdminController {
  constructor(private readonly guidelines: GuidelinesService) {}

  @Get()
  @ApiOkResponse({ type: AdminGuidelineListDto })
  list(@Query() query: AdminGuidelineListQueryDto): Promise<AdminGuidelineListDto> {
    return this.guidelines.adminList(query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminGuidelineDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: CreateGuidelineDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminGuidelineDto> {
    return this.guidelines.create(body, { userId: principalOf(req).userId, meta });
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminGuidelineDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminGuidelineDto> {
    return this.guidelines.adminGet(id);
  }

  @Put(':id')
  @ApiOkResponse({ type: AdminGuidelineDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateGuidelineDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminGuidelineDto> {
    return this.guidelines.update(id, body, { userId: principalOf(req).userId, meta });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.guidelines.remove(id, { userId: principalOf(req).userId, meta });
  }

  @Post(':id/versions')
  @ApiCreatedResponse({ type: AdminGuidelineDto })
  addVersion(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: GuidelineVersionInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminGuidelineDto> {
    return this.guidelines.addVersion(id, body, { userId: principalOf(req).userId, meta });
  }

  @Delete(':id/versions/:versionId')
  @ApiOkResponse({ type: AdminGuidelineDto })
  removeVersion(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminGuidelineDto> {
    return this.guidelines.removeVersion(id, versionId, {
      userId: principalOf(req).userId,
      meta,
    });
  }
}
