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
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  JoinInputDto,
  ProjectDto,
  ProjectInputDto,
  ProjectListDto,
  ProjectListQueryDto,
  ResearchRequestDto,
  ResearchRequestListDto,
} from './research.dto';
import { ResearchService } from './research.service';

/** Research projects (M27), for verified people; the service checks who may do what. */
@ApiTags('research')
@Controller('research')
@Authenticated()
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('projects')
  @ApiOkResponse({ type: ProjectListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: ProjectListQueryDto,
  ): Promise<ProjectListDto> {
    return this.research.list(principalOf(req), query);
  }

  @Post('projects')
  @ApiCreatedResponse({ type: ProjectDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: ProjectInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectDto> {
    return this.research.create(principalOf(req), body, meta);
  }

  @Get('projects/:id')
  @ApiOkResponse({ type: ProjectDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProjectDto> {
    return this.research.get(principalOf(req), id);
  }

  @Put('projects/:id')
  @ApiOkResponse({ type: ProjectDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ProjectInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectDto> {
    return this.research.update(principalOf(req), id, body, meta);
  }

  @Post('projects/:id/end')
  @HttpCode(200)
  @ApiOkResponse({ type: ProjectDto })
  end(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectDto> {
    return this.research.end(principalOf(req), id, meta);
  }

  @Post('projects/:id/requests')
  @ApiCreatedResponse({ type: ResearchRequestDto })
  ask(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: JoinInputDto,
  ): Promise<ResearchRequestDto> {
    return this.research.ask(principalOf(req), id, body);
  }

  @Get('requests')
  @ApiOkResponse({ type: ResearchRequestListDto })
  requests(@Req() req: RequestWithPrincipal): Promise<ResearchRequestListDto> {
    return this.research.requests(principalOf(req));
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  @ApiOkResponse({ type: ResearchRequestDto })
  accept(@Req() req: RequestWithPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.research.step(principalOf(req), id, 'accept');
  }

  @Post('requests/:id/decline')
  @HttpCode(200)
  @ApiOkResponse({ type: ResearchRequestDto })
  decline(@Req() req: RequestWithPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.research.step(principalOf(req), id, 'decline');
  }

  @Post('requests/:id/withdraw')
  @HttpCode(200)
  @ApiOkResponse({ type: ResearchRequestDto })
  withdraw(@Req() req: RequestWithPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.research.step(principalOf(req), id, 'withdraw');
  }
}
