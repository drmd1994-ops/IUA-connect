import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  PrincipalResolver,
  type RequestWithPrincipal,
  principalOf,
} from '../../common/auth/principal';
import { Authenticated, Public } from '../../common/decorators/access.decorators';
import {
  PositionDto,
  PositionListDto,
  PositionListQueryDto,
  SavedPositionListDto,
} from './positions.dto';
import { PositionsService } from './positions.service';

/**
 * Jobs, fellowships and research posts (M28). Everyone reads them, visitors too (owner answer
 * §10.4); a signed-in reader also sees which they saved, and keeps their own list.
 */
@ApiTags('positions')
@Controller('positions')
export class PositionsController {
  constructor(
    private readonly positions: PositionsService,
    private readonly principals: PrincipalResolver,
  ) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: PositionListDto })
  async list(
    @Req() req: RequestWithPrincipal,
    @Query() query: PositionListQueryDto,
  ): Promise<PositionListDto> {
    return this.positions.list(await this.caller(req), query);
  }

  // Before ':id', so "saved" is never read as an ID.
  @Get('saved')
  @Authenticated()
  @ApiOkResponse({ type: SavedPositionListDto })
  saved(@Req() req: RequestWithPrincipal): Promise<SavedPositionListDto> {
    return this.positions.saved(principalOf(req));
  }

  @Get(':id')
  @Public()
  @ApiOkResponse({ type: PositionDto })
  async get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PositionDto> {
    return this.positions.get(await this.caller(req), id);
  }

  @Put(':id/saved')
  @Authenticated()
  @HttpCode(204)
  @ApiNoContentResponse()
  save(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.positions.save(principalOf(req), id);
  }

  @Delete(':id/saved')
  @Authenticated()
  @HttpCode(204)
  @ApiNoContentResponse()
  unsave(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.positions.unsave(principalOf(req), id);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}
