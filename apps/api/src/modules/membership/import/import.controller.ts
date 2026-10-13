import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../../common/auth/principal';
import { RequireScopedPermission } from '../../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../../common/request-meta';
import { ImportApplyDto, ImportBatchDto, ImportDryRunDto } from './import.dto';
import { ImportService } from './import.service';

/**
 * CSV membership import: dry run, then apply (M2 plan §3.6). Audited by the service.
 *
 * A file brings members into one organisation (M16): membership.manage is used where it is
 * held, and a batch of another organisation reads as "not found".
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/memberships/import')
@RequireScopedPermission('membership.manage')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  /** Checks the file and reports what applying it would do. Changes nothing. */
  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: ImportBatchDto })
  dryRun(
    @Req() req: RequestWithPrincipal,
    @Body() body: ImportDryRunDto,
    @Meta() meta: RequestMeta,
  ): Promise<ImportBatchDto> {
    return this.imports.dryRun(body.csv, body.fileName, principalOf(req), body.organisation, meta);
  }

  @Post(':batchId/apply')
  @HttpCode(200)
  @ApiOkResponse({ type: ImportBatchDto })
  apply(
    @Req() req: RequestWithPrincipal,
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Body() body: ImportApplyDto,
    @Meta() meta: RequestMeta,
  ): Promise<ImportBatchDto> {
    return this.imports.apply(batchId, body.csv, principalOf(req), meta);
  }
}
