import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { DemoEmailDto, DemoOutboxListDto } from './demo-outbox.dto';
import { DemoOutboxService } from './demo-outbox.service';

/**
 * The demo's sent emails, for the platform's staff (users.manage, in a session that completed
 * MFA). Absent (404) unless the demo mailer is in use.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/demo-outbox')
@RequirePermission('users.manage')
export class DemoOutboxController {
  constructor(private readonly outbox: DemoOutboxService) {}

  @Get()
  @ApiOkResponse({ type: DemoOutboxListDto })
  list(): Promise<DemoOutboxListDto> {
    return this.outbox.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: DemoEmailDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id') id: string,
    @Meta() meta: RequestMeta,
  ): Promise<DemoEmailDto> {
    return this.outbox.get(id, principalOf(req), meta);
  }
}
