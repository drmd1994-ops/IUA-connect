import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/access.decorators';
import { OrganisationDto, OrganisationListDto } from './organisations.dto';
import { OrganisationsService } from './organisations.service';

const CACHE_PUBLIC = 'public, max-age=300';

/**
 * The organisations that have a section on the platform (API_DESIGN.md §4). Open to everyone:
 * who an organisation is, never anything about its members.
 */
@ApiTags('organisations')
@Controller('organisations')
@Public()
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get()
  @Header('Cache-Control', CACHE_PUBLIC)
  @ApiOkResponse({ type: OrganisationListDto })
  async list(): Promise<OrganisationListDto> {
    return { items: await this.organisations.list() };
  }

  /** By its address ("slug") or its id. */
  @Get(':slugOrId')
  @Header('Cache-Control', CACHE_PUBLIC)
  @ApiOkResponse({ type: OrganisationDto })
  find(@Param('slugOrId') slugOrId: string): Promise<OrganisationDto> {
    return this.organisations.find(slugOrId);
  }
}
