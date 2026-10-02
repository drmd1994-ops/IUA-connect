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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminBroadcastDto,
  AdminBroadcastListDto,
  BroadcastAudienceDto,
  BroadcastInputDto,
  BroadcastListQueryDto,
  BroadcastMessageDto,
  BroadcastQueryDto,
  BroadcastRejectDto,
} from './broadcasts.dto';
import { BroadcastsService } from './broadcasts.service';

/**
 * Broadcasts in the admin area. Writing needs broadcasts.create; approving and rejecting also
 * need broadcasts.approve and a different admin than the author (checked in the service).
 * Admin roles apply only in a session that completed MFA.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/broadcasts')
@RequirePermission('broadcasts.create')
export class BroadcastsAdminController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  @ApiOkResponse({ type: AdminBroadcastListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: BroadcastListQueryDto,
  ): Promise<AdminBroadcastListDto> {
    return this.broadcasts.list(query, principalOf(req));
  }

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Sending the same request again with the same key creates nothing new.',
  })
  @ApiCreatedResponse({ type: AdminBroadcastDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: BroadcastInputDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    return this.broadcasts.create(body, idempotencyKey, principalOf(req), meta);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminBroadcastDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminBroadcastDto> {
    return this.broadcasts.get(id, principalOf(req));
  }

  @Put(':id')
  @ApiOkResponse({ type: AdminBroadcastDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: BroadcastInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    return this.broadcasts.update(id, body, principalOf(req), meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.broadcasts.remove(id, principalOf(req), meta);
  }

  /** How many people the message would reach if it were sent now. */
  @Get(':id/audience')
  @ApiOkResponse({ type: BroadcastAudienceDto })
  audience(@Param('id', new ParseUUIDPipe()) id: string): Promise<BroadcastAudienceDto> {
    return this.broadcasts.audience(id);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminBroadcastDto })
  submit(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    return this.broadcasts.submit(id, principalOf(req), meta);
  }

  /** Approves and sends. Never by the author. */
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminBroadcastDto })
  approve(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    return this.broadcasts.approve(id, principalOf(req), meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminBroadcastDto })
  reject(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: BroadcastRejectDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminBroadcastDto> {
    return this.broadcasts.reject(id, body.reason, principalOf(req), meta);
  }
}

/** A sent broadcast, read by one of the people it reached. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('broadcasts')
@Authenticated()
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get(':id')
  @ApiOkResponse({ type: BroadcastMessageDto })
  read(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: BroadcastQueryDto,
  ): Promise<BroadcastMessageDto> {
    return this.broadcasts.read(id, query.locale, principalOf(req));
  }
}
