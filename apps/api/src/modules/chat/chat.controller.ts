import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { type Observable, map } from 'rxjs';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { RATE_LIMITS } from '../../common/decorators/rate-limit.decorator';
import { hitUserLimit } from '../../common/guards/user-rate-limit';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { ChatStream } from './chat-stream';
import {
  ConversationDetailDto,
  ConversationListDto,
  ConversationListQueryDto,
  ConversationSettingsDto,
  EditMessageDto,
  MessageDto,
  MessageListDto,
  MessageListQueryDto,
  ReadDto,
  SendMessageDto,
  StartConversationDto,
  UnreadCountDto,
} from './chat.dto';
import { ChatService } from './chat.service';

/**
 * Chat (M11): the reader's conversations and their messages. Every route needs a signed-in
 * account, and the service then checks that the reader is part of the conversation; anything
 * else is "not found". Starting a conversation and sending also need an active membership.
 */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@Authenticated()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly stream: ChatStream,
    private readonly limits: RateLimitStore,
  ) {}

  @Get('conversations')
  @ApiOkResponse({ type: ConversationListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: ConversationListQueryDto,
  ): Promise<ConversationListDto> {
    return this.chat.list(principalOf(req), query);
  }

  /** Opens the conversation with a person: 201 when it is new, 200 when it existed. */
  @Post('conversations')
  @ApiCreatedResponse({ type: ConversationDetailDto })
  @ApiOkResponse({ type: ConversationDetailDto })
  async start(
    @Req() req: RequestWithPrincipal,
    @Body() body: StartConversationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationDetailDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatConversationsPerUser, principal.userId, res);
    const { conversation, created } = await this.chat.start(principal, body.userId);
    res.status(created ? 201 : 200);
    return conversation;
  }

  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@Req() req: RequestWithPrincipal): Promise<UnreadCountDto> {
    return { conversations: await this.chat.unreadCount(principalOf(req)) };
  }

  /**
   * The reader's live events, as a text/event-stream (M11 plan §6). Each event names ids only.
   * The stream ends after ten minutes; the browser opens a new one.
   */
  @Sse('stream')
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Server-sent events; each one is a JSON object with a "type".' })
  events(@Req() req: RequestWithPrincipal): Observable<MessageEvent> {
    return this.stream.open(principalOf(req).userId).pipe(map((event) => ({ data: event })));
  }

  @Get('conversations/:id')
  @ApiOkResponse({ type: ConversationDetailDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConversationDetailDto> {
    return this.chat.get(principalOf(req), id);
  }

  /** Mute, archive or mark as unread: the reader's own settings of the conversation. */
  @Patch('conversations/:id/me')
  @ApiOkResponse({ type: ConversationDetailDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ConversationSettingsDto,
  ): Promise<ConversationDetailDto> {
    return this.chat.update(principalOf(req), id, body);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReadDto,
  ): Promise<void> {
    return this.chat.read(principalOf(req), id, body.seq);
  }

  /** "… is typing". Nothing is stored; more than one signal in three seconds is dropped. */
  @Post('conversations/:id/typing')
  @HttpCode(204)
  @ApiNoContentResponse()
  async typing(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const principal = principalOf(req);
    const rule = RATE_LIMITS.chatTypingPerUser;
    const hit = await this.limits.hit(`${rule.name}:user:${principal.userId}`, rule.windowSec);
    if (hit.count > rule.limit) return;
    await this.chat.typing(principal, id);
  }

  @Get('conversations/:id/messages')
  @ApiOkResponse({ type: MessageListDto })
  messages(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: MessageListQueryDto,
  ): Promise<MessageListDto> {
    return this.chat.messages(principalOf(req), id, query);
  }

  /** Sends a message: 201, or 200 when the same Idempotency-Key already sent it. */
  @Post('conversations/:id/messages')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Sending the same request again with the same key sends nothing new.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiOkResponse({ type: MessageDto })
  async send(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendMessageDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageDto> {
    const principal = principalOf(req);
    await hitUserLimit(this.limits, RATE_LIMITS.chatMessagesPerUser, principal.userId, res);
    const { message, created } = await this.chat.send(principal, id, body, idempotencyKey);
    res.status(created ? 201 : 200);
    return message;
  }

  @Patch('messages/:id')
  @ApiOkResponse({ type: MessageDto })
  edit(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EditMessageDto,
  ): Promise<MessageDto> {
    return this.chat.edit(principalOf(req), id, body.body);
  }

  /** Delete for everyone: the sender's own message. */
  @Delete('messages/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.chat.remove(principalOf(req), id);
  }

  /** Delete for me: the message leaves the reader's side only. */
  @Post('messages/:id/hide')
  @HttpCode(204)
  @ApiNoContentResponse()
  hide(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.chat.hide(principalOf(req), id);
  }
}
