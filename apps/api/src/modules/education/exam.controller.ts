import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import {
  PrincipalResolver,
  type RequestWithPrincipal,
  principalOf,
} from '../../common/auth/principal';
import {
  Authenticated,
  Public,
  RequirePermission,
} from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { EducationHistoryDto, EducationTransitionDto } from './education.dto';
import {
  AdminExamQuestionDto,
  AdminExamQuestionListDto,
  AdminExamQuestionListQueryDto,
  AnswerInputDto,
  AnswerResultDto,
  ExamQuestionInputDto,
  ExamResultsDto,
  ExamResultsQueryDto,
  NextQuestionDto,
  NextQuestionQueryDto,
} from './exam.dto';
import { ExamAdminService } from './exam-admin.service';
import { ExamPracticeService } from './exam-practice.service';

/**
 * Exam questions in the admin area. Writing needs education.manage; the transition endpoint
 * checks the permission each step needs (reviewing is education.review). Admin roles apply only
 * in a session that completed MFA.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/exam-questions')
@RequirePermission('education.manage')
export class ExamAdminController {
  constructor(private readonly questions: ExamAdminService) {}

  @Get()
  @ApiOkResponse({ type: AdminExamQuestionListDto })
  list(@Query() query: AdminExamQuestionListQueryDto): Promise<AdminExamQuestionListDto> {
    return this.questions.list(query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminExamQuestionDto })
  async create(
    @Req() req: RequestWithPrincipal,
    @Body() body: ExamQuestionInputDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminExamQuestionDto> {
    return withEtag(res, await this.questions.create(body, principalOf(req), meta));
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminExamQuestionDto })
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminExamQuestionDto> {
    return withEtag(res, await this.questions.get(id));
  }

  @Put(':id')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The version you edited: "<n>"' })
  @ApiOkResponse({ type: AdminExamQuestionDto })
  async update(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ExamQuestionInputDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminExamQuestionDto> {
    return withEtag(res, await this.questions.update(id, body, ifMatch, principalOf(req), meta));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.questions.remove(id, principalOf(req), meta);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminExamQuestionDto })
  async transition(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EducationTransitionDto,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminExamQuestionDto> {
    return withEtag(res, await this.questions.transition(id, body, principalOf(req), meta));
  }

  @Get(':id/history')
  @ApiOkResponse({ type: EducationHistoryDto })
  history(@Param('id', new ParseUUIDPipe()) id: string): Promise<EducationHistoryDto> {
    return this.questions.history(id);
  }
}

function withEtag(res: Response, item: AdminExamQuestionDto): AdminExamQuestionDto {
  res.setHeader('ETag', `"${item.version}"`);
  return item;
}

/**
 * Practising exam questions. Open to everyone for public questions; signed-in members also get
 * what their membership allows, and their answers are stored.
 */
@ApiTags('education')
@Controller('exam-questions')
@Public()
export class ExamPracticeController {
  constructor(
    private readonly practice: ExamPracticeService,
    private readonly principals: PrincipalResolver,
  ) {}

  /** A question to answer, without the right answer or the explanations. */
  @Get('next')
  @ApiOkResponse({ type: NextQuestionDto })
  async next(
    @Req() req: RequestWithPrincipal,
    @Query() query: NextQuestionQueryDto,
  ): Promise<NextQuestionDto> {
    return this.practice.next(await this.caller(req), query);
  }

  /** Answers a question and returns the right option, every explanation and the summary. */
  @Post(':id/answer')
  @HttpCode(200)
  @ApiOkResponse({ type: AnswerResultDto })
  async answer(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AnswerInputDto,
  ): Promise<AnswerResultDto> {
    return this.practice.answer(await this.caller(req), id, body.position, body.locale);
  }

  private async caller(req: RequestWithPrincipal) {
    return req.principal ?? (await this.principals.resolve(req));
  }
}

/** The signed-in person's own exam results. Nobody else can read them. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/exam-results')
@Authenticated()
export class ExamResultsController {
  constructor(private readonly practice: ExamPracticeService) {}

  @Get()
  @ApiOkResponse({ type: ExamResultsDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Query() query: ExamResultsQueryDto,
  ): Promise<ExamResultsDto> {
    return this.practice.results(principalOf(req), query.locale);
  }
}
