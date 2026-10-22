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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminExamReportListDto,
  AdminExamReportQueryDto,
  ExamQuestionStatisticsDto,
  ExamReportCreatedDto,
  ExamReportDecisionDto,
  ExamReportInputDto,
  MyExamReportListDto,
  MyExamReportQueryDto,
} from './exam-report.dto';
import { ExamReportService } from './exam-report.service';

/** A signed-in reader reports what is wrong with a question (M23). */
@ApiTags('education')
@ApiBearerAuth()
@Controller('exam-questions/:id/reports')
@Authenticated()
export class ExamReportController {
  constructor(private readonly reports: ExamReportService) {}

  @Post()
  @ApiCreatedResponse({ type: ExamReportCreatedDto })
  report(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ExamReportInputDto,
  ): Promise<ExamReportCreatedDto> {
    return this.reports.report(principalOf(req), id, body);
  }
}

/** The reports the signed-in person sent, with the reviewers' answers. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/exam-reports')
@Authenticated()
export class MyExamReportsController {
  constructor(private readonly reports: ExamReportService) {}

  @Get()
  @ApiOkResponse({ type: MyExamReportListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: MyExamReportQueryDto,
  ): Promise<MyExamReportListDto> {
    return this.reports.mine(principalOf(req), query.locale);
  }
}

/** The question reviewers' queue of reports (education.review). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/exam-reports')
@RequirePermission('education.review')
export class ExamReportAdminController {
  constructor(private readonly reports: ExamReportService) {}

  @Get()
  @ApiOkResponse({ type: AdminExamReportListDto })
  list(@Query() query: AdminExamReportQueryDto): Promise<AdminExamReportListDto> {
    return this.reports.list(query);
  }

  /** Deals with the report and tells its reader. */
  @Post(':id/decision')
  @HttpCode(204)
  @ApiNoContentResponse()
  decide(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ExamReportDecisionDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.reports.decide(id, body, principalOf(req), meta);
  }
}

/** How readers answered a question; nothing below 5 people, never who (education.manage). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/exam-questions/:id/statistics')
@RequirePermission('education.manage')
export class ExamStatisticsController {
  constructor(private readonly reports: ExamReportService) {}

  @Get()
  @ApiOkResponse({ type: ExamQuestionStatisticsDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ExamQuestionStatisticsDto> {
    return this.reports.statistics(id);
  }
}
