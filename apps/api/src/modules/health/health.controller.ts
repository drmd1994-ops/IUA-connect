import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/errors/app.exception';
import { ErrorEnvelopeDto } from '../../common/errors/error-envelope.dto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { HealthStatusDto } from './health.dto';

/** Liveness and readiness probes (ARCHITECTURE.md §10). Not versioned, not rate limited. */
@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @HttpCode(200)
  @ApiOkResponse({ type: HealthStatusDto })
  live(): HealthStatusDto {
    return { status: 'ok' };
  }

  /**
   * Ready when the database answers. The job queue check is added with pg-boss (M3).
   */
  @Get('ready')
  @HttpCode(200)
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiServiceUnavailableResponse({
    description: 'A dependency is unavailable',
    type: ErrorEnvelopeDto,
  })
  async ready(): Promise<HealthStatusDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException('SERVICE_UNAVAILABLE', [{ field: 'database', code: 'UNAVAILABLE' }]);
    }
    return { status: 'ok' };
  }
}
