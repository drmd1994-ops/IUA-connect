import { rm } from 'node:fs/promises';
import os from 'node:os';
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
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { RATE_LIMITS } from '../../common/decorators/rate-limit.decorator';
import { AppException } from '../../common/errors/app.exception';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { CHAT_VIDEO_MAX_BYTES, FileDto, FilesService } from '../files';
import { ActivityService } from './activity.service';
import { ChatAccess } from './chat-access';
import {
  AcceptedInvitationDto,
  ActivityDto,
  ActivityQueryDto,
  ChatPeopleDto,
  ConversationSettingsDto,
  ForwardDto,
  GroupAdminDto,
  GroupCreateDto,
  GroupDto,
  GroupMembersDto,
  GroupMembersQueryDto,
  GroupRenameDto,
  InvitationListDto,
  InviteDto,
  InviteePeopleQueryDto,
  MessageDto,
  MessageListDto,
  MessageListQueryDto,
  ReadDto,
  RoomSendDto,
  SentInvitationsDto,
} from './chat.dto';
import { ChatService } from './chat.service';
import { GroupsService } from './groups.service';
import { InvitationsService } from './invitations.service';
import { RoomsService } from './rooms.service';

const uuid = () => new ParseUUIDPipe();

interface DiskUpload {
  path: string;
  originalname: string;
  size: number;
}

/**
 * Group chats, invitations, activity, forwarding and files in messages (M13). Every route
 * needs a signed-in account; the services decide who may do what, and answer "not found" for
 * anything the reader has no part in.
 */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@Authenticated()
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly invitations: InvitationsService,
    private readonly activity: ActivityService,
    private readonly chat: ChatService,
    private readonly rooms: RoomsService,
    private readonly access: ChatAccess,
    private readonly files: FilesService,
    private readonly limits: RateLimitStore,
  ) {}

  // --- Groups ---------------------------------------------------------------------------------

  /** Makes a group and invites people to it. Nobody is in it until they accept. */
  @Post('groups')
  @ApiCreatedResponse({ type: GroupDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: GroupCreateDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GroupDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatGroupsPerUser, principal.userId, res);
    if (body.userIds.length > 0) {
      await hitUserLimit(
        this.limits,
        RATE_LIMITS.chatInvitationsPerUser,
        principal.userId,
        res,
        body.userIds.length,
      );
      // Checked before the group exists, so a group is never left half invited.
      await this.invitations.ensureGroupInvitable(principal, body.userIds);
    }
    const group = await this.groups.create(principal, body.name, meta);
    if (body.userIds.length > 0) {
      await this.invitations.invite(principal, group.id, body.userIds, meta);
    }
    return group;
  }

  @Get('groups/:id')
  @ApiOkResponse({ type: GroupDto })
  get(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<GroupDto> {
    return this.groups.get(principalOf(req), id);
  }

  /** The admin renames the group. */
  @Patch('groups/:id')
  @ApiOkResponse({ type: GroupDto })
  rename(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: GroupRenameDto,
    @Meta() meta: RequestMeta,
  ): Promise<GroupDto> {
    return this.groups.rename(principalOf(req), id, body.name, meta);
  }

  /** Mute, archive, pin or mark as unread: the reader's own settings of the group. */
  @Patch('groups/:id/me')
  @ApiOkResponse({ type: GroupDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: ConversationSettingsDto,
  ): Promise<GroupDto> {
    return this.groups.update(principalOf(req), id, body);
  }

  @Post('groups/:id/leave')
  @HttpCode(204)
  @ApiNoContentResponse()
  leave(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<void> {
    return this.groups.leave(principalOf(req), id);
  }

  /** Everyone in the group, the admin first (also the "@" suggestions). */
  @Get('groups/:id/members')
  @ApiOkResponse({ type: GroupMembersDto })
  members(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Query() query: GroupMembersQueryDto,
  ): Promise<GroupMembersDto> {
    return this.groups.members(principalOf(req), id, query.q);
  }

  /** The admin takes a person out of the group. */
  @Post('groups/:id/members/:userId/remove')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMember(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Param('userId', uuid()) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.groups.removeMember(principalOf(req), id, userId, meta);
  }

  /** The admin hands the group to another of its people. */
  @Post('groups/:id/admin')
  @HttpCode(200)
  @ApiOkResponse({ type: GroupDto })
  passAdmin(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: GroupAdminDto,
    @Meta() meta: RequestMeta,
  ): Promise<GroupDto> {
    return this.groups.passAdmin(principalOf(req), id, body.userId, meta);
  }

  @Get('groups/:id/messages')
  @ApiOkResponse({ type: MessageListDto })
  messages(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Query() query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    return this.groups.messages(principalOf(req), id, query);
  }

  /** Writes in the group: 201, or 200 when the same Idempotency-Key already sent it. */
  @Post('groups/:id/messages')
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
    // A group has no moderators and no announcements.
    if (body.announcement) throw new AppException('FORBIDDEN', [{ code: 'chatModeratorsOnly' }]);
    const { message, created } = await this.groups.send(principal, id, body, idempotencyKey);
    res.status(created ? 201 : 200);
    return message;
  }

  @Post('groups/:id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: ReadDto,
  ): Promise<void> {
    return this.groups.read(principalOf(req), id, body.seq);
  }

  /** "… is typing". Nothing is stored; more than one signal in three seconds is dropped. */
  @Post('groups/:id/typing')
  @HttpCode(204)
  @ApiNoContentResponse()
  async typing(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<void> {
    const principal = principalOf(req);
    const rule = RATE_LIMITS.chatTypingPerUser;
    const hit = await this.limits.hit(`${rule.name}:user:${principal.userId}`, rule.windowSec);
    if (hit.count > rule.limit) return;
    await this.groups.typing(principal, id);
  }

  // --- Invitations ----------------------------------------------------------------------------

  /** The people the reader may invite, by name; with a group or room, the ones not yet in it. */
  @Get('invitable')
  @ApiOkResponse({ type: ChatPeopleDto })
  async invitable(
    @Req() req: RequestWithPrincipal,
    @Query() query: InviteePeopleQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChatPeopleDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatSearchPerUser, principal.userId, res);
    return this.invitations.people(principal, query.q, query.conversationId);
  }

  /** The reader's invitations that wait for an answer. */
  @Get('invitations')
  @ApiOkResponse({ type: InvitationListDto })
  myInvitations(@Req() req: RequestWithPrincipal): Promise<InvitationListDto> {
    return this.invitations.mine(principalOf(req));
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  @ApiOkResponse({ type: AcceptedInvitationDto })
  accept(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AcceptedInvitationDto> {
    return this.invitations.accept(principalOf(req), id, meta);
  }

  @Post('invitations/:id/decline')
  @HttpCode(204)
  @ApiNoContentResponse()
  decline(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<void> {
    return this.invitations.decline(principalOf(req), id);
  }

  /** Takes an invitation back: whoever may invite to that group or room. */
  @Delete('invitations/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  withdraw(@Req() req: RequestWithPrincipal, @Param('id', uuid()) id: string): Promise<void> {
    return this.invitations.withdraw(principalOf(req), id);
  }

  /** Invites people to a group (its admin) or to a room by invitation (moderators, staff). */
  @Post(['groups/:id/invitations', 'rooms/:id/invitations'])
  @HttpCode(204)
  @ApiNoContentResponse()
  async invite(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: InviteDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    await hitUserLimit(
      this.limits,
      RATE_LIMITS.chatInvitationsPerUser,
      principal.userId,
      res,
      body.userIds.length,
    );
    await this.invitations.invite(principal, id, body.userIds, meta);
  }

  /** The invitations to a group or room that nobody answered yet. */
  @Get(['groups/:id/invitations', 'rooms/:id/invitations'])
  @ApiOkResponse({ type: SentInvitationsDto })
  sent(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
  ): Promise<SentInvitationsDto> {
    return this.invitations.sent(principalOf(req), id);
  }

  // --- Activity -------------------------------------------------------------------------------

  /** Who of these people is around, as far as the reader may know. */
  @Get('activity')
  @ApiOkResponse({ type: ActivityDto })
  activityOf(
    @Req() req: RequestWithPrincipal,
    @Query() query: ActivityQueryDto,
  ): Promise<ActivityDto> {
    return this.activity.get(principalOf(req), query.userIds);
  }

  // --- Forwarding -----------------------------------------------------------------------------

  /**
   * Sends a copy of a message the reader can read, with its files, to a conversation, group or
   * room they can write in. The copy is marked "forwarded" and doesn't say whose it was.
   */
  @Post('messages/:id/forward')
  @ApiCreatedResponse({ type: MessageDto })
  async forward(
    @Req() req: RequestWithPrincipal,
    @Param('id', uuid()) id: string,
    @Body() body: ForwardDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatMessagesPerUser, principal.userId, res);
    const content = await this.chat.forwardable(principal, id);
    const to = body.conversationId;
    const input = { body: content.body };
    switch (await this.chat.kindFor(principal.userId, to)) {
      case 'DIRECT':
        return (await this.chat.send(principal, to, input, undefined, content)).message;
      case 'GROUP':
        return (await this.groups.send(principal, to, input, undefined, content)).message;
      case 'ROOM':
        return (await this.rooms.send(principal, to, input, undefined, content)).message;
    }
  }

  // --- Files ----------------------------------------------------------------------------------

  /**
   * Uploads a file to send with a message: a JPEG or PNG picture or a PDF (10 MB), or an MP4
   * video (100 MB). The upload is written to disk as it arrives, never held in memory. Until it
   * is sent with a message the file is its uploader's alone, and it is removed after a day.
   */
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: os.tmpdir(),
      limits: { fileSize: CHAT_VIDEO_MAX_BYTES, files: 1, fields: 0 },
      // Browsers send file names as UTF-8; multer would read them as Latin-1 (garbling Hebrew).
      defParamCharset: 'utf8',
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: FileDto })
  async upload(
    @Req() req: RequestWithPrincipal,
    @UploadedFile() file: DiskUpload | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FileDto> {
    try {
      const principal = principalOf(req);
      const me = principal.userId;
      await hitUserLimit(this.limits, RATE_LIMITS.chatUploadsPerUser, me, res);
      await this.access.ensureActiveMember(principal);
      await this.access.ensureNotSuspended(me);
      if (!file) {
        throw new AppException('VALIDATION_FAILED', [{ field: 'file', code: 'fileMissing' }]);
      }
      return await this.files.uploadForChat(file, me, meta);
    } finally {
      // Stored files were moved or copied away; whatever is left is the temporary upload.
      if (file) await rm(file.path, { force: true });
    }
  }
}
