import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  Authenticated,
  RequirePermission,
  RequireScopedPermission,
} from '../../common/decorators/access.decorators';
import { RATE_LIMITS } from '../../common/decorators/rate-limit.decorator';
import { AppException } from '../../common/errors/app.exception';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import {
  AdminReportCategoriesDto,
  AdminReportCategoryDto,
  AdminRoomCategoriesDto,
  AdminRoomCategoryDto,
  AdminRoomDto,
  AdminRoomInputDto,
  AdminRoomListDto,
  AdminRoomListQueryDto,
  MessageDto,
  MessageListDto,
  MessageListQueryDto,
  ModeratorInputDto,
  ReactionParamsDto,
  ReadDto,
  ReportCategoryCreateDto,
  ReportCategoryInputDto,
  RoomBanDto,
  RoomBanInputDto,
  RoomBanListDto,
  RoomCategoriesDto,
  RoomCategoryCreateDto,
  RoomCategoryInputDto,
  RoomDetailDto,
  RoomListDto,
  RoomListQueryDto,
  RoomLockDto,
  RoomMembersDto,
  RoomMembersQueryDto,
  RoomPinsDto,
  RoomRemoveDto,
  RoomSendDto,
  RoomSettingsDto,
} from './chat.dto';
import { ChatService } from './chat.service';
import { RoomsAdminService } from './rooms-admin.service';
import { RoomsService } from './rooms.service';

const uuid = () => new ParseUUIDPipe();

/**
 * Chat rooms for members (M12). Every route needs a signed-in account; the service decides
 * who may see the list, read a room, write in it and moderate it.
 */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@Authenticated()
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly chat: ChatService,
    private readonly limits: RateLimitStore,
  ) {}

  /** Every open room, for "Browse rooms". */
  @Get('rooms')
  @ApiOkResponse({ type: RoomListDto })
  browse(@Req() req: RequestWithPrincipal, @Query() query: RoomListQueryDto): Promise<RoomListDto> {
    return this.rooms.browse(principalOf(req), query);
  }

  /** The rooms the reader is in. */
  @Get('rooms/mine')
  @ApiOkResponse({ type: RoomListDto })
  mine(@Req() req: RequestWithPrincipal, @Query() query: RoomListQueryDto): Promise<RoomListDto> {
    return this.rooms.mine(principalOf(req), query);
  }

  @Get('room-categories')
  @ApiOkResponse({ type: RoomCategoriesDto })
  categories(@Req() req: RequestWithPrincipal): Promise<RoomCategoriesDto> {
    return this.rooms.categories(principalOf(req));
  }

  @Get('rooms/:id')
  @ApiOkResponse({ type: RoomDetailDto })
  get(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<RoomDetailDto> {
    return this.rooms.get(principalOf(req), id);
  }

  @Post('rooms/:id/join')
  @HttpCode(200)
  @ApiOkResponse({ type: RoomDetailDto })
  async join(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RoomDetailDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatJoinsPerUser, principal.userId, res);
    return this.rooms.join(principal, id);
  }

  @Post('rooms/:id/leave')
  @HttpCode(204)
  @ApiNoContentResponse()
  leave(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<void> {
    return this.rooms.leave(principalOf(req), id);
  }

  /** Mute or mark as unread: the reader's own settings of the room. */
  @Patch('rooms/:id/me')
  @ApiOkResponse({ type: RoomDetailDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: RoomSettingsDto,
  ): Promise<RoomDetailDto> {
    return this.rooms.update(principalOf(req), id, body);
  }

  /** The people in the room, moderators first (also the "@" suggestions). */
  @Get('rooms/:id/members')
  @ApiOkResponse({ type: RoomMembersDto })
  members(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Query() query: RoomMembersQueryDto,
  ): Promise<RoomMembersDto> {
    return this.rooms.members(principalOf(req), id, query);
  }

  @Get('rooms/:id/messages')
  @ApiOkResponse({ type: MessageListDto })
  messages(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Query() query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    return this.rooms.messages(principalOf(req), id, query);
  }

  /** Writes in the room: 201, or 200 when the same Idempotency-Key already sent it. */
  @Post('rooms/:id/messages')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Sending the same request again with the same key sends nothing new.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiOkResponse({ type: MessageDto })
  async send(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: RoomSendDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatMessagesPerUser, principal.userId, res);
    if (body.announcement) {
      // An announcement tells the whole room: at most one a minute in a room.
      const hit = await this.limits.hit(`chat-announcement:room:${id}`, 60);
      if (hit.count > 1) {
        res.setHeader('Retry-After', String(hit.resetInSec));
        throw new AppException('RATE_LIMITED');
      }
    }
    const { message, created } = await this.rooms.send(principal, id, body, idempotencyKey);
    res.status(created ? 201 : 200);
    return message;
  }

  @Post('rooms/:id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: ReadDto,
  ): Promise<void> {
    return this.rooms.read(principalOf(req), id, body.seq);
  }

  @Post('rooms/:id/typing')
  @HttpCode(204)
  @ApiNoContentResponse()
  async typing(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<void> {
    const principal = principalOf(req);
    const rule = RATE_LIMITS.chatTypingPerUser;
    const hit = await this.limits.hit(`${rule.name}:user:${principal.userId}`, rule.windowSec);
    if (hit.count > rule.limit) return;
    await this.rooms.typing(principal, id);
  }

  // --- Reactions (rooms and private conversations) --------------------------------------------

  @Put('messages/:id/reactions/:reaction')
  @ApiOkResponse({ type: MessageDto })
  async react(
    @Req() req: RequestWithPrincipal,
    @Param() params: ReactionParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatReactionsPerUser, principal.userId, res);
    return this.chat.react(principal, params.id, params.reaction, true);
  }

  @Delete('messages/:id/reactions/:reaction')
  @ApiOkResponse({ type: MessageDto })
  unreact(
    @Req() req: RequestWithPrincipal,
    @Param() params: ReactionParamsDto,
  ): Promise<MessageDto> {
    return this.chat.react(principalOf(req), params.id, params.reaction, false);
  }

  // --- Pins and moderation: a moderator of the room, or staff ---------------------------------

  @Get('rooms/:id/pins')
  @ApiOkResponse({ type: RoomPinsDto })
  pins(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<RoomPinsDto> {
    return this.rooms.pins(principalOf(req), id);
  }

  @Post('rooms/:id/pins/:messageId')
  @HttpCode(204)
  @ApiNoContentResponse()
  pin(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('messageId', uuid()) messageId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.rooms.pin(principalOf(req), id, messageId, meta);
  }

  @Delete('rooms/:id/pins/:messageId')
  @HttpCode(204)
  @ApiNoContentResponse()
  unpin(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('messageId', uuid()) messageId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.rooms.unpin(principalOf(req), id, messageId, meta);
  }

  /** A moderator deletes a message: "removed by a moderator" stays in its place. */
  @Delete('rooms/:id/messages/:messageId')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMessage(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('messageId', uuid()) messageId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.rooms.removeMessage(principalOf(req), id, messageId, meta);
  }

  @Post('rooms/:id/lock')
  @HttpCode(200)
  @ApiOkResponse({ type: RoomDetailDto })
  lock(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: RoomLockDto,
    @Meta() meta: RequestMeta,
  ): Promise<RoomDetailDto> {
    return this.rooms.lock(principalOf(req), id, body.minutes ?? null, meta);
  }

  @Post('rooms/:id/unlock')
  @HttpCode(200)
  @ApiOkResponse({ type: RoomDetailDto })
  unlock(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<RoomDetailDto> {
    return this.rooms.unlock(principalOf(req), id, meta);
  }

  /** Takes a person out of the room. They may join again. */
  @Post('rooms/:id/members/:userId/remove')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMember(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('userId', uuid()) userId: string,
    @Body() body: RoomRemoveDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.rooms.removeMember(principalOf(req), id, userId, body.reason, meta);
  }

  @Get('rooms/:id/bans')
  @ApiOkResponse({ type: RoomBanListDto })
  bans(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<RoomBanListDto> {
    return this.rooms.bans(principalOf(req), id);
  }

  @Post('rooms/:id/bans')
  @ApiCreatedResponse({ type: RoomBanDto })
  ban(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: RoomBanInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<RoomBanDto> {
    return this.rooms.ban(principalOf(req), id, body, meta);
  }

  @Post('rooms/:id/bans/:banId/lift')
  @HttpCode(200)
  @ApiOkResponse({ type: RoomBanDto })
  liftBan(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('banId', uuid()) banId: string,
    @Meta() meta: RequestMeta,
  ): Promise<RoomBanDto> {
    return this.rooms.liftBan(principalOf(req), id, banId, meta);
  }
}

/**
 * Rooms in the admin area (chat.rooms.manage, only in a session that completed two-step
 * verification): open, edit and archive rooms, appoint moderators, and keep the lists of room
 * categories and report reasons.
 *
 * A room is an organisation's or the platform's own, and chat.rooms.manage is used where it is
 * held (M16): the service checks the owner, and another owner's room reads as "not found". The
 * two lists (room categories, report reasons) are the platform's: its staff keep them, and an
 * organisation's staff read the categories.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/chat')
@RequireScopedPermission('chat.rooms.manage')
export class RoomsAdminController {
  constructor(private readonly admin: RoomsAdminService) {}

  @Get('rooms')
  @ApiOkResponse({ type: AdminRoomListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: AdminRoomListQueryDto,
  ): Promise<AdminRoomListDto> {
    return this.admin.list(principalOf(req), query);
  }

  @Post('rooms')
  @ApiCreatedResponse({ type: AdminRoomDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: AdminRoomInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    return this.admin.create(principalOf(req), body, meta);
  }

  @Get('rooms/:id')
  @ApiOkResponse({ type: AdminRoomDto })
  get(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<AdminRoomDto> {
    return this.admin.get(principalOf(req), id);
  }

  @Put('rooms/:id')
  @ApiOkResponse({ type: AdminRoomDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: AdminRoomInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    return this.admin.update(principalOf(req), id, body, meta);
  }

  @Post('rooms/:id/archive')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminRoomDto })
  archive(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    return this.admin.archive(principalOf(req), id, meta);
  }

  @Post('rooms/:id/restore')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminRoomDto })
  restore(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    return this.admin.restore(principalOf(req), id, meta);
  }

  @Post('rooms/:id/moderators')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminRoomDto })
  addModerator(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: ModeratorInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    return this.admin.addModerator(principalOf(req), id, body.userId, meta);
  }

  @Post('rooms/:id/moderators/:userId/remove')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminRoomDto })
  removeModerator(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('userId', uuid()) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomDto> {
    return this.admin.removeModerator(principalOf(req), id, userId, meta);
  }

  @Get('room-categories')
  @ApiOkResponse({ type: AdminRoomCategoriesDto })
  categories(): Promise<AdminRoomCategoriesDto> {
    return this.admin.categories();
  }

  @Post('room-categories')
  @RequirePermission('chat.rooms.manage')
  @ApiCreatedResponse({ type: AdminRoomCategoryDto })
  createCategory(
    @Req() req: RequestWithPrincipal,
    @Body() body: RoomCategoryCreateDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomCategoryDto> {
    return this.admin.createCategory(principalOf(req), body, meta);
  }

  @Put('room-categories/:id')
  @RequirePermission('chat.rooms.manage')
  @ApiOkResponse({ type: AdminRoomCategoryDto })
  updateCategory(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: RoomCategoryInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminRoomCategoryDto> {
    return this.admin.updateCategory(principalOf(req), id, body, meta);
  }

  @Delete('room-categories/:id')
  @RequirePermission('chat.rooms.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeCategory(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.admin.removeCategory(principalOf(req), id, meta);
  }

  @Get('report-categories')
  @RequirePermission('chat.rooms.manage')
  @ApiOkResponse({ type: AdminReportCategoriesDto })
  reportCategories(): Promise<AdminReportCategoriesDto> {
    return this.admin.reportCategories();
  }

  @Post('report-categories')
  @RequirePermission('chat.rooms.manage')
  @ApiCreatedResponse({ type: AdminReportCategoryDto })
  createReportCategory(
    @Req() req: RequestWithPrincipal,
    @Body() body: ReportCategoryCreateDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminReportCategoryDto> {
    return this.admin.createReportCategory(principalOf(req), body, meta);
  }

  @Put('report-categories/:id')
  @RequirePermission('chat.rooms.manage')
  @ApiOkResponse({ type: AdminReportCategoryDto })
  updateReportCategory(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: ReportCategoryInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminReportCategoryDto> {
    return this.admin.updateReportCategory(principalOf(req), id, body, meta);
  }
}
