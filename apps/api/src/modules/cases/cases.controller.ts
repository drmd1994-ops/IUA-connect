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
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { FileDto, type FileView } from '../files';
import {
  CaseDto,
  CaseHistoryDto,
  CaseInputDto,
  CaseListDto,
  CaseListQueryDto,
  CasePictureQueryDto,
  CasePollDto,
  CaseQueueDto,
  CaseReportInputDto,
  CaseReviewInputDto,
  CaseVoteDto,
  MyCasesDto,
} from './cases.dto';
import { CasesService } from './cases.service';

const MB = 1024 * 1024;

/** Case discussions (M26), for verified people; the service checks who may see and do what. */
@ApiTags('cases')
@Controller('cases')
@Authenticated()
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  @ApiOkResponse({ type: CaseListDto })
  list(@Req() req: RequestWithPrincipal, @Query() query: CaseListQueryDto): Promise<CaseListDto> {
    return this.cases.list(principalOf(req), query);
  }

  // Fixed addresses before ':id', so they are never read as an ID.
  @Get('mine')
  @ApiOkResponse({ type: MyCasesDto })
  mine(@Req() req: RequestWithPrincipal): Promise<MyCasesDto> {
    return this.cases.mine(principalOf(req));
  }

  @Get('review')
  @ApiOkResponse({ type: CaseQueueDto })
  queue(@Req() req: RequestWithPrincipal): Promise<CaseQueueDto> {
    return this.cases.queue(principalOf(req));
  }

  /** A picture for a case: JPEG or PNG, confirmed by its author to show no identifying details. */
  @Post('pictures')
  @RateLimit(RATE_LIMITS.uploadPerIp)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * MB, files: 1, fields: 0 },
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
  picture(
    @Req() req: RequestWithPrincipal,
    @Query() _query: CasePictureQueryDto,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<FileView> {
    return this.cases.uploadPicture(principalOf(req), file, meta);
  }

  @Post()
  @ApiCreatedResponse({ type: CaseDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: CaseInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<CaseDto> {
    return this.cases.create(principalOf(req), body, meta);
  }

  @Get(':id')
  @ApiOkResponse({ type: CaseDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CaseDto> {
    return this.cases.get(principalOf(req), id);
  }

  @Put(':id')
  @ApiOkResponse({ type: CaseDto })
  update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CaseInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<CaseDto> {
    return this.cases.update(principalOf(req), id, body, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.cases.remove(principalOf(req), id, meta);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOkResponse({ type: CaseDto })
  submit(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<CaseDto> {
    return this.cases.submit(principalOf(req), id, meta);
  }

  @Put(':id/vote')
  @ApiOkResponse({ type: CasePollDto })
  vote(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CaseVoteDto,
  ): Promise<CasePollDto> {
    return this.cases.vote(principalOf(req), id, body.optionId);
  }

  @Post(':id/report')
  @HttpCode(204)
  @ApiNoContentResponse()
  report(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CaseReportInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.cases.report(principalOf(req), id, body.reason, meta);
  }

  @Post(':id/review')
  @HttpCode(200)
  @ApiOkResponse({ type: CaseDto })
  review(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CaseReviewInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<CaseDto> {
    return this.cases.review(principalOf(req), id, body, meta);
  }

  @Get(':id/history')
  @ApiOkResponse({ type: CaseHistoryDto })
  history(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CaseHistoryDto> {
    return this.cases.history(principalOf(req), id);
  }
}
