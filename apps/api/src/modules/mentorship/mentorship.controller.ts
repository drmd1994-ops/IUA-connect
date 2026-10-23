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
import { Authenticated } from '../../common/decorators/access.decorators';
import {
  MentorListDto,
  MentorListQueryDto,
  MentorSettingsDto,
  MentorSettingsInputDto,
  MentorshipDto,
  MentorshipListDto,
  MentorshipRequestInputDto,
} from './mentorship.dto';
import { MentorshipService } from './mentorship.service';

/**
 * Mentorship (M28). For signed-in people: the service lets verified people see mentors and ask
 * them, and verified specialists offer mentorship. A request is seen by its two people only.
 */
@ApiTags('mentorship')
@Controller('mentorship')
@Authenticated()
export class MentorshipController {
  constructor(private readonly mentorship: MentorshipService) {}

  @Get('mentors')
  @ApiOkResponse({ type: MentorListDto })
  mentors(
    @Req() req: RequestWithPrincipal,
    @Query() query: MentorListQueryDto,
  ): Promise<MentorListDto> {
    return this.mentorship.mentors(principalOf(req), query);
  }

  @Get('settings')
  @ApiOkResponse({ type: MentorSettingsDto })
  settings(@Req() req: RequestWithPrincipal): Promise<MentorSettingsDto> {
    return this.mentorship.settings(principalOf(req));
  }

  @Put('settings')
  @ApiOkResponse({ type: MentorSettingsDto })
  saveSettings(
    @Req() req: RequestWithPrincipal,
    @Body() body: MentorSettingsInputDto,
  ): Promise<MentorSettingsDto> {
    return this.mentorship.saveSettings(principalOf(req), body);
  }

  @Get('requests')
  @ApiOkResponse({ type: MentorshipListDto })
  list(@Req() req: RequestWithPrincipal): Promise<MentorshipListDto> {
    return this.mentorship.list(principalOf(req));
  }

  @Post('requests')
  @ApiCreatedResponse({ type: MentorshipDto })
  ask(
    @Req() req: RequestWithPrincipal,
    @Body() body: MentorshipRequestInputDto,
  ): Promise<MentorshipDto> {
    return this.mentorship.ask(principalOf(req), body);
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  @ApiOkResponse({ type: MentorshipDto })
  accept(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MentorshipDto> {
    return this.mentorship.step(principalOf(req), id, 'accept');
  }

  @Post('requests/:id/decline')
  @HttpCode(200)
  @ApiOkResponse({ type: MentorshipDto })
  decline(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MentorshipDto> {
    return this.mentorship.step(principalOf(req), id, 'decline');
  }

  @Post('requests/:id/withdraw')
  @HttpCode(200)
  @ApiOkResponse({ type: MentorshipDto })
  withdraw(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MentorshipDto> {
    return this.mentorship.step(principalOf(req), id, 'withdraw');
  }

  @Post('requests/:id/end')
  @HttpCode(200)
  @ApiOkResponse({ type: MentorshipDto })
  end(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MentorshipDto> {
    return this.mentorship.step(principalOf(req), id, 'end');
  }
}
