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
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated, RequireAnyPermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  JournalClubAdminEntryDto,
  JournalClubAdminListDto,
  JournalClubAdminListQueryDto,
  JournalClubArticleDto,
  JournalClubEntryDto,
  JournalClubHistoryDto,
  JournalClubInputDto,
  JournalClubListDto,
  JournalClubListQueryDto,
  JournalClubLookupDto,
  JournalClubPollDto,
  JournalClubScopeDto,
  JournalClubTransitionDto,
  JournalClubVoteDto,
} from './journal-club.dto';
import { JournalClubService } from './journal-club.service';

/** The journal club (M31), for verified people; the service checks who may see what. */
@ApiTags('journal-club')
@Controller('journal-club')
@Authenticated()
export class JournalClubController {
  constructor(private readonly club: JournalClubService) {}

  @Get()
  @ApiOkResponse({ type: JournalClubListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: JournalClubListQueryDto,
  ): Promise<JournalClubListDto> {
    return this.club.list(principalOf(req), query);
  }

  @Get(':id')
  @ApiOkResponse({ type: JournalClubEntryDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<JournalClubEntryDto> {
    return this.club.get(principalOf(req), id);
  }

  @Put(':id/vote')
  @ApiOkResponse({ type: JournalClubPollDto })
  vote(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: JournalClubVoteDto,
  ): Promise<JournalClubPollDto> {
    return this.club.vote(principalOf(req), id, body.answer);
  }
}

/**
 * Writing and publishing journal club entries (M31): editors for every subspecialty, or a
 * subspecialty admin for their own; the service checks the subspecialty of every entry, and one
 * the caller may not work on reads as "not found". Audited by the service.
 */
@ApiTags('admin')
@Controller('admin/journal-club')
@RequireAnyPermission('journalclub.manage', 'journalclub.subspecialty')
export class JournalClubAdminController {
  constructor(private readonly club: JournalClubService) {}

  @Get()
  @ApiOkResponse({ type: JournalClubAdminListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: JournalClubAdminListQueryDto,
  ): Promise<JournalClubAdminListDto> {
    return this.club.adminList(principalOf(req), query);
  }

  // Before ':id', so these are never read as an ID.
  @Get('scope')
  @ApiOkResponse({ type: JournalClubScopeDto })
  scope(@Req() req: RequestWithPrincipal): Promise<JournalClubScopeDto> {
    return this.club.scope(principalOf(req));
  }

  @Post('lookup')
  @HttpCode(200)
  @ApiOkResponse({ type: JournalClubArticleDto })
  lookup(
    @Req() req: RequestWithPrincipal,
    @Body() body: JournalClubLookupDto,
  ): Promise<JournalClubArticleDto> {
    return this.club.lookup(principalOf(req), body);
  }

  @Post()
  @ApiCreatedResponse({ type: JournalClubAdminEntryDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: JournalClubInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<JournalClubAdminEntryDto> {
    return this.club.create(principalOf(req), body, meta);
  }

  @Get(':id')
  @ApiOkResponse({ type: JournalClubAdminEntryDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<JournalClubAdminEntryDto> {
    return this.club.adminGet(principalOf(req), id);
  }

  @Put(':id')
  @ApiOkResponse({ type: JournalClubAdminEntryDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: JournalClubInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<JournalClubAdminEntryDto> {
    return this.club.update(principalOf(req), id, body, meta);
  }

  @Post(':id/transition')
  @HttpCode(200)
  @ApiOkResponse({ type: JournalClubAdminEntryDto })
  transition(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: JournalClubTransitionDto,
    @Meta() meta: RequestMeta,
  ): Promise<JournalClubAdminEntryDto> {
    return this.club.transition(principalOf(req), id, body, meta);
  }

  @Get(':id/history')
  @ApiOkResponse({ type: JournalClubHistoryDto })
  history(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<JournalClubHistoryDto> {
    return this.club.history(principalOf(req), id);
  }
}
