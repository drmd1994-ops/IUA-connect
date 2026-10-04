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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { RATE_LIMITS } from '../../common/decorators/rate-limit.decorator';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { ChatSettingsService } from './chat-settings.service';
import {
  BlockInputDto,
  BlockListDto,
  ChatPeopleDto,
  ChatPeopleQueryDto,
  ChatSettingsDto,
} from './chat.dto';

/** Finding someone to write to, and the people the reader blocked. */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@Authenticated()
export class ChatPeopleController {
  constructor(
    private readonly settings: ChatSettingsService,
    private readonly limits: RateLimitStore,
  ) {}

  /** The people the reader may start a conversation with, by name. 60 searches a minute. */
  @Get('people')
  @ApiOkResponse({ type: ChatPeopleDto })
  async people(
    @Req() req: RequestWithPrincipal,
    @Query() query: ChatPeopleQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChatPeopleDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatSearchPerUser, principal.userId, res);
    return this.settings.people(principal, query.q);
  }

  @Get('blocks')
  @ApiOkResponse({ type: BlockListDto })
  blocked(@Req() req: RequestWithPrincipal): Promise<BlockListDto> {
    return this.settings.blocked(principalOf(req).userId);
  }

  @Post('blocks')
  @HttpCode(204)
  @ApiNoContentResponse()
  block(
    @Req() req: RequestWithPrincipal,
    @Body() body: BlockInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.settings.block(principalOf(req), body.userId, meta);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  unblock(
    @Req() req: RequestWithPrincipal,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.settings.unblock(principalOf(req), userId, meta);
  }
}

/** The signed-in person's chat settings. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/chat-settings')
@Authenticated()
export class ChatSettingsController {
  constructor(private readonly settings: ChatSettingsService) {}

  @Get()
  @ApiOkResponse({ type: ChatSettingsDto })
  get(@Req() req: RequestWithPrincipal): Promise<ChatSettingsDto> {
    return this.settings.settings(principalOf(req).userId);
  }

  @Put()
  @ApiOkResponse({ type: ChatSettingsDto })
  set(
    @Req() req: RequestWithPrincipal,
    @Body() body: ChatSettingsDto,
    @Meta() meta: RequestMeta,
  ): Promise<ChatSettingsDto> {
    return this.settings.setSettings(principalOf(req).userId, body, meta);
  }
}
