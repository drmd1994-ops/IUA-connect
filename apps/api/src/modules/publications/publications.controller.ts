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
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import {
  PublicationDraftListDto,
  PublicationDto,
  PublicationInputDto,
  PublicationListDto,
  PublicationLookupDto,
  PublicationOrderDto,
} from './publications.dto';
import { PublicationsService } from './publications.service';

/** A person's own publications (M27), and a member's, as others see them. */
@ApiTags('publications')
@Controller()
@Authenticated()
export class PublicationsController {
  constructor(private readonly publications: PublicationsService) {}

  @Get('me/publications')
  @ApiOkResponse({ type: PublicationListDto })
  mine(@Req() req: RequestWithPrincipal): Promise<PublicationListDto> {
    return this.publications.mine(principalOf(req));
  }

  @Post('me/publications')
  @ApiCreatedResponse({ type: PublicationDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: PublicationInputDto,
  ): Promise<PublicationDto> {
    return this.publications.create(principalOf(req), body);
  }

  // Before ':id', so these are never read as an id.
  @Put('me/publications/order')
  @ApiOkResponse({ type: PublicationListDto })
  order(
    @Req() req: RequestWithPrincipal,
    @Body() body: PublicationOrderDto,
  ): Promise<PublicationListDto> {
    return this.publications.order(principalOf(req), body.ids);
  }

  @Post('me/publications/lookup')
  @HttpCode(200)
  @ApiOkResponse({ type: PublicationDraftListDto })
  lookup(
    @Req() req: RequestWithPrincipal,
    @Body() body: PublicationLookupDto,
  ): Promise<PublicationDraftListDto> {
    return this.publications.lookup(principalOf(req), body);
  }

  @Get('me/publications/orcid')
  @ApiOkResponse({ type: PublicationDraftListDto })
  orcid(@Req() req: RequestWithPrincipal): Promise<PublicationDraftListDto> {
    return this.publications.fromOrcid(principalOf(req));
  }

  @Put('me/publications/:id')
  @ApiOkResponse({ type: PublicationDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PublicationInputDto,
  ): Promise<PublicationDto> {
    return this.publications.update(principalOf(req), id, body);
  }

  @Delete('me/publications/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.publications.remove(principalOf(req), id);
  }

  @Get('members/:id/publications')
  @ApiOkResponse({ type: PublicationListDto })
  ofMember(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PublicationListDto> {
    return this.publications.ofMember(principalOf(req), id);
  }
}
