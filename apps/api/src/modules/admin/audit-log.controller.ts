import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { AuditLogListDto, AuditLogQueryDto } from './audit-log.dto';
import { AuditLogService } from './audit-log.service';

/** The audit log, read-only, for people with audit.read in a session that completed MFA. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@RequirePermission('audit.read')
export class AuditLogController {
  constructor(private readonly logs: AuditLogService) {}

  @Get()
  @ApiOkResponse({ type: AuditLogListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AuditLogQueryDto,
    @Meta() meta: RequestMeta,
  ): Promise<AuditLogListDto> {
    return this.logs.list(query, principalOf(req), meta);
  }
}
