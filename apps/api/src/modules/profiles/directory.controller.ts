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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { RATE_LIMITS } from '../../common/decorators/rate-limit.decorator';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import {
  ConsentInputDto,
  ConsentsDto,
  DirectoryListDto,
  DirectoryMemberDto,
  DirectoryQueryDto,
} from './directory.dto';
import { DirectoryService } from './directory.service';

/**
 * The member directory: for signed-in active members, listing members who opted in. Limited to
 * 30 requests a minute per person (API_DESIGN.md §5), with no export and 20 members per page.
 */
@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
@Authenticated()
export class DirectoryController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly limits: RateLimitStore,
  ) {}

  @Get()
  @ApiOkResponse({ type: DirectoryListDto })
  async list(
    @Req() req: RequestWithPrincipal,
    @Query() query: DirectoryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DirectoryListDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.directoryPerUser, principal.userId, res);
    return this.directory.list(principal, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: DirectoryMemberDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DirectoryMemberDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.directoryPerUser, principal.userId, res);
    return this.directory.get(principal, id);
  }
}

/** The signed-in person's consents: being listed in the member directory. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/consents')
@Authenticated()
export class ConsentsController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  @ApiOkResponse({ type: ConsentsDto })
  get(@Req() req: RequestWithPrincipal): Promise<ConsentsDto> {
    return this.directory.consents(principalOf(req).userId);
  }

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: ConsentsDto })
  set(
    @Req() req: RequestWithPrincipal,
    @Body() body: ConsentInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<ConsentsDto> {
    return this.directory.setConsent(principalOf(req).userId, body, meta);
  }
}
