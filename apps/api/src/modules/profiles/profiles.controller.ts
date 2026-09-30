import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { ProfileDto, UpdateProfileDto } from './profiles.dto';
import { ProfilesService } from './profiles.service';

/** The signed-in member's own profile, with per-field visibility (API_DESIGN.md §4). */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/profile')
@Authenticated()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOkResponse({ type: ProfileDto })
  get(@Req() req: RequestWithPrincipal): Promise<ProfileDto> {
    return this.profiles.get(principalOf(req).userId);
  }

  /** Audited by the service (it records which fields changed, not their values). */
  @Patch()
  @ApiOkResponse({ type: ProfileDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Body() body: UpdateProfileDto,
    @Meta() meta: RequestMeta,
  ): Promise<ProfileDto> {
    return this.profiles.update(principalOf(req).userId, body, meta);
  }
}
