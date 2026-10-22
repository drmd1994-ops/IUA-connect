import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import {
  MockExamAnswerDto,
  MockExamDto,
  MockExamListDto,
  MockExamQueryDto,
  MockExamStartDto,
} from './mock-exam.dto';
import { MockExamService } from './mock-exam.service';

/** The signed-in person's mock exams (M23). Nobody else can read them. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/mock-exams')
@Authenticated()
export class MockExamController {
  constructor(private readonly exams: MockExamService) {}

  @Get()
  @ApiOkResponse({ type: MockExamListDto })
  list(@Req() req: RequestWithPrincipal): Promise<MockExamListDto> {
    return this.exams.list(principalOf(req));
  }

  /** Starts an exam: the questions are chosen and the clock starts. */
  @Post()
  @ApiCreatedResponse({ type: MockExamDto })
  start(
    @Req() req: RequestWithPrincipal,
    @Body() body: MockExamStartDto,
    @Query() query: MockExamQueryDto,
  ): Promise<MockExamDto> {
    return this.exams.start(principalOf(req), body, query.locale);
  }

  @Get(':id')
  @ApiOkResponse({ type: MockExamDto })
  get(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: MockExamQueryDto,
  ): Promise<MockExamDto> {
    return this.exams.get(principalOf(req), id, query.locale);
  }

  /** Chooses an option for the question at this position; refused once time is up. */
  @Put(':id/answers/:position')
  @HttpCode(204)
  @ApiNoContentResponse()
  answer(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('position', new ParseIntPipe()) position: number,
    @Body() body: MockExamAnswerDto,
  ): Promise<void> {
    return this.exams.answer(principalOf(req), id, position, body.position);
  }

  /** Ends the exam now; returns it with the right answers and explanations. */
  @Post(':id/finish')
  @HttpCode(200)
  @ApiOkResponse({ type: MockExamDto })
  finish(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: MockExamQueryDto,
  ): Promise<MockExamDto> {
    return this.exams.finish(principalOf(req), id, query.locale);
  }
}
