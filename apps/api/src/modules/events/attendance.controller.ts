import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AttendanceListDto,
  AttendanceListQueryDto,
  AttendanceRecordDto,
  CheckInCodeDto,
  CheckInCodeQueryDto,
  CheckInDto,
  CheckInResultDto,
  ManualAttendanceDto,
  VoidAttendanceDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';

/** The member's side: the page a scanned venue code opens sends the code here. */
@ApiTags('events')
@ApiBearerAuth()
@Controller('events/:slug')
@Authenticated()
export class EventCheckInController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check-in')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckInResultDto })
  checkIn(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Body() body: CheckInDto,
  ): Promise<CheckInResultDto> {
    return this.attendance.checkIn(principalOf(req), slug, body.token);
  }
}

/** Attendance of one event (API_DESIGN.md §4 "/admin/events/{id}/attendance"). events.manage. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/events/:eventId')
@RequirePermission('events.manage')
export class AttendanceAdminController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('attendance')
  @ApiOkResponse({ type: AttendanceListDto })
  list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: AttendanceListQueryDto,
  ): Promise<AttendanceListDto> {
    return this.attendance.list(eventId, query);
  }

  /** The address to show as a QR code at the venue. Ask again before it expires. */
  @Get('attendance/code')
  @ApiOkResponse({ type: CheckInCodeDto })
  code(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: CheckInCodeQueryDto,
  ): Promise<CheckInCodeDto> {
    return this.attendance.code(eventId, query.sessionId, query.locale);
  }

  @Get('attendance.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  async csv(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.attendance.csv(eventId);
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
    return file;
  }

  @Post('attendance')
  @ApiCreatedResponse({ type: AttendanceRecordDto })
  record(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() body: ManualAttendanceDto,
    @Meta() meta: RequestMeta,
  ): Promise<AttendanceRecordDto> {
    return this.attendance.recordManually(eventId, body, {
      userId: principalOf(req).userId,
      meta,
    });
  }

  @Post('attendance/:attendanceId/void')
  @HttpCode(200)
  @ApiOkResponse({ type: AttendanceRecordDto })
  void(
    @Req() req: RequestWithPrincipal,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('attendanceId', new ParseUUIDPipe()) attendanceId: string,
    @Body() body: VoidAttendanceDto,
    @Meta() meta: RequestMeta,
  ): Promise<AttendanceRecordDto> {
    return this.attendance.void(eventId, attendanceId, body.reason, {
      userId: principalOf(req).userId,
      meta,
    });
  }
}
