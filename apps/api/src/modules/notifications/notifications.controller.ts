import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, Public } from '../../common/decorators/access.decorators';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  NotificationListDto,
  NotificationListQueryDto,
  NotificationPreferencesDto,
  NotificationPreferencesInputDto,
  UnreadCountDto,
  UnsubscribeInputDto,
  UnsubscribeResultDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

/** The signed-in person's own notices. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@Authenticated()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationListDto> {
    return this.notifications.list(principalOf(req), query);
  }

  /** The number on the bell. */
  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountDto })
  async unread(@Req() req: RequestWithPrincipal): Promise<UnreadCountDto> {
    return { unread: await this.notifications.unread(principalOf(req)) };
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiNoContentResponse()
  readAll(@Req() req: RequestWithPrincipal): Promise<void> {
    return this.notifications.readAll(principalOf(req));
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(@Req() req: RequestWithPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.read(principalOf(req), id);
  }
}

/** Which kinds of notice the person wants, in the app and by email. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/notification-preferences')
@Authenticated()
export class NotificationPreferencesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPreferencesDto })
  get(@Req() req: RequestWithPrincipal): Promise<NotificationPreferencesDto> {
    return this.notifications.preferences(principalOf(req).userId);
  }

  @Put()
  @ApiOkResponse({ type: NotificationPreferencesDto })
  set(
    @Req() req: RequestWithPrincipal,
    @Body() body: NotificationPreferencesInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.setPreferences(principalOf(req), body, meta);
  }
}

/**
 * The "stop these emails" link (M7 plan §2.5). Public: the signed token names the person and
 * the kind; it switches off email for that kind and does nothing else.
 */
@ApiTags('notifications')
@Controller('notifications/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @Public()
  @RateLimit({ name: 'unsubscribe-ip', limit: 30, windowSec: 60, by: 'ip' })
  @HttpCode(200)
  @ApiOkResponse({ type: UnsubscribeResultDto })
  unsubscribe(
    @Body() body: UnsubscribeInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<UnsubscribeResultDto> {
    return this.notifications.unsubscribe(body.token, meta);
  }
}
