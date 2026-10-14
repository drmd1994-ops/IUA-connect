import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  Authenticated,
  RequirePermission,
  RequireScopedPermission,
} from '../../common/decorators/access.decorators';
import { RATE_LIMITS } from '../../common/decorators/rate-limit.decorator';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { ChatReportsService } from './chat-reports.service';
import {
  AdminReportDto,
  AdminReportListDto,
  AdminReportListQueryDto,
  AdminSuspensionDto,
  AdminSuspensionListDto,
  AdminSuspensionListQueryDto,
  LiftSuspensionDto,
  ReportCategoriesDto,
  ReportCreatedDto,
  ReportInputDto,
  ResolveReportDto,
  SuspendInputDto,
} from './chat.dto';

/** Reporting a message or a person, by someone in the conversation. */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@Authenticated()
export class ChatReportsController {
  constructor(
    private readonly reports: ChatReportsService,
    private readonly limits: RateLimitStore,
  ) {}

  @Get('report-categories')
  @ApiOkResponse({ type: ReportCategoriesDto })
  categories(): Promise<ReportCategoriesDto> {
    return this.reports.categories();
  }

  /** 201, or 200 when the reader's earlier report of the same thing is still open. */
  @Post('reports')
  @ApiCreatedResponse({ type: ReportCreatedDto })
  @ApiOkResponse({ type: ReportCreatedDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: ReportInputDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReportCreatedDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatReportsPerUser, principal.userId, res);
    const { id, created } = await this.reports.create(principal, body, meta);
    res.status(created ? 201 : 200);
    return { id };
  }
}

/**
 * Chat reports in the admin area (chat.moderate, held by staff, only in a session that completed
 * two-step verification). There is no route for reading conversations: a report carries the
 * reported message and the five before and after it, and each look is audited.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/chat')
@RequireScopedPermission('chat.moderate')
export class ChatAdminController {
  constructor(private readonly reports: ChatReportsService) {}

  @Get('reports')
  @ApiOkResponse({ type: AdminReportListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AdminReportListQueryDto,
  ): Promise<AdminReportListDto> {
    return this.reports.list(principalOf(req), query);
  }

  @Get('reports/:id')
  @ApiOkResponse({ type: AdminReportDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminReportDto> {
    return this.reports.get(principalOf(req), id, meta);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminReportDto })
  resolve(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveReportDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminReportDto> {
    return this.reports.resolve(principalOf(req), id, body, meta);
  }

  // A suspension stops a person writing anywhere in chat: the platform's staff decide it.
  @Get('suspensions')
  @RequirePermission('chat.moderate')
  @ApiOkResponse({ type: AdminSuspensionListDto })
  suspensions(@Query() query: AdminSuspensionListQueryDto): Promise<AdminSuspensionListDto> {
    return this.reports.suspensions(query.page);
  }

  @Post('suspensions')
  @RequirePermission('chat.moderate')
  @ApiCreatedResponse({ type: AdminSuspensionDto })
  suspend(
    @Req() req: RequestWithPrincipal,
    @Body() body: SuspendInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSuspensionDto> {
    return this.reports.suspend(principalOf(req), body, meta);
  }

  @Post('suspensions/:id/lift')
  @RequirePermission('chat.moderate')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminSuspensionDto })
  lift(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: LiftSuspensionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminSuspensionDto> {
    return this.reports.lift(principalOf(req), id, body.reason, meta);
  }
}
