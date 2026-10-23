import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { CommunitiesService } from './communities.service';
import {
  AnswerInputDto,
  BanInputDto,
  BanListDto,
  CommentEditDto,
  CommentInputDto,
  CommunityDto,
  CommunityListDto,
  PagedQueryDto,
  PostDto,
  PostEditDto,
  PostInputDto,
  PostListDto,
  PostListQueryDto,
  ReasonDto,
} from './community.dto';
import { PostsService } from './posts.service';

/**
 * Communities (M25). Signed-in people reach these routes; the services let in verified people,
 * and staff who run communities or moderate chat, and refuse everyone else.
 */
@ApiTags('communities')
@Controller()
@Authenticated()
export class CommunityController {
  constructor(
    private readonly communities: CommunitiesService,
    private readonly posts: PostsService,
  ) {}

  // --- Communities ------------------------------------------------------------------------------

  @Get('communities')
  @ApiOkResponse({ type: CommunityListDto })
  list(@Req() req: RequestWithPrincipal): Promise<CommunityListDto> {
    return this.communities.list(principalOf(req));
  }

  // Before 'communities/:slug', so "feed" and "bookmarks" are never read as a community.
  @Get('communities/feed')
  @ApiOkResponse({ type: PostListDto })
  feed(@Req() req: RequestWithPrincipal, @Query() query: PagedQueryDto): Promise<PostListDto> {
    return this.posts.feed(principalOf(req), query.page);
  }

  @Get('communities/bookmarks')
  @ApiOkResponse({ type: PostListDto })
  bookmarks(@Req() req: RequestWithPrincipal, @Query() query: PagedQueryDto): Promise<PostListDto> {
    return this.posts.bookmarks(principalOf(req), query.page);
  }

  @Get('communities/:slug')
  @ApiOkResponse({ type: CommunityDto })
  get(@Req() req: RequestWithPrincipal, @Param('slug') slug: string): Promise<CommunityDto> {
    return this.communities.get(principalOf(req), slug);
  }

  @Put('communities/:slug/follow')
  @HttpCode(204)
  @ApiNoContentResponse()
  follow(@Req() req: RequestWithPrincipal, @Param('slug') slug: string): Promise<void> {
    return this.communities.follow(principalOf(req), slug, true);
  }

  @Delete('communities/:slug/follow')
  @HttpCode(204)
  @ApiNoContentResponse()
  unfollow(@Req() req: RequestWithPrincipal, @Param('slug') slug: string): Promise<void> {
    return this.communities.follow(principalOf(req), slug, false);
  }

  @Get('communities/:slug/posts')
  @ApiOkResponse({ type: PostListDto })
  posts_(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Query() query: PostListQueryDto,
  ): Promise<PostListDto> {
    return this.posts.list(principalOf(req), slug, query);
  }

  @Post('communities/:slug/posts')
  @ApiCreatedResponse({ type: PostDto })
  write(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Body() body: PostInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.create(principalOf(req), slug, body, meta);
  }

  @Get('communities/:slug/bans')
  @ApiOkResponse({ type: BanListDto })
  bans(@Req() req: RequestWithPrincipal, @Param('slug') slug: string): Promise<BanListDto> {
    return this.communities.bans(principalOf(req), slug);
  }

  @Post('communities/:slug/bans')
  @HttpCode(204)
  @ApiNoContentResponse()
  ban(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Body() body: BanInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.communities.ban(principalOf(req), slug, body, meta);
  }

  @Delete('communities/:slug/bans/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  liftBan(
    @Req() req: RequestWithPrincipal,
    @Param('slug') slug: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.communities.liftBan(principalOf(req), slug, userId, meta);
  }

  // --- Posts ------------------------------------------------------------------------------------

  @Get('posts/:id')
  @ApiOkResponse({ type: PostDto })
  post(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PostDto> {
    return this.posts.get(principalOf(req), id);
  }

  @Patch('posts/:id')
  @ApiOkResponse({ type: PostDto })
  edit(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PostEditDto,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.edit(principalOf(req), id, body, meta);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.posts.deleteOwn(principalOf(req), id, meta);
  }

  @Post('posts/:id/comments')
  @ApiCreatedResponse({ type: PostDto })
  comment(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CommentInputDto,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.comment(principalOf(req), id, body, meta);
  }

  @Put('posts/:id/answer')
  @ApiOkResponse({ type: PostDto })
  answer(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AnswerInputDto,
  ): Promise<PostDto> {
    return this.posts.setAnswer(principalOf(req), id, body.commentId);
  }

  @Put('posts/:id/reactions/:reaction')
  @ApiOkResponse({ type: PostDto })
  reactPost(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reaction') reaction: string,
  ): Promise<PostDto> {
    return this.posts.react(principalOf(req), 'post', id, reaction, true);
  }

  @Delete('posts/:id/reactions/:reaction')
  @ApiOkResponse({ type: PostDto })
  unreactPost(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reaction') reaction: string,
  ): Promise<PostDto> {
    return this.posts.react(principalOf(req), 'post', id, reaction, false);
  }

  @Put('posts/:id/bookmark')
  @HttpCode(204)
  @ApiNoContentResponse()
  bookmark(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.posts.bookmark(principalOf(req), id, true);
  }

  @Delete('posts/:id/bookmark')
  @HttpCode(204)
  @ApiNoContentResponse()
  unbookmark(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.posts.bookmark(principalOf(req), id, false);
  }

  @Put('posts/:id/follow')
  @HttpCode(204)
  @ApiNoContentResponse()
  followPost(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.posts.follow(principalOf(req), id, true);
  }

  @Delete('posts/:id/follow')
  @HttpCode(204)
  @ApiNoContentResponse()
  unfollowPost(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.posts.follow(principalOf(req), id, false);
  }

  @Post('posts/:id/remove')
  @HttpCode(200)
  @ApiOkResponse({ type: PostDto })
  removeByModerator(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.removePost(principalOf(req), id, body.reason, meta);
  }

  @Post('posts/:id/lock')
  @HttpCode(200)
  @ApiOkResponse({ type: PostDto })
  lock(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.lock(principalOf(req), id, true, meta);
  }

  @Post('posts/:id/unlock')
  @HttpCode(200)
  @ApiOkResponse({ type: PostDto })
  unlock(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.lock(principalOf(req), id, false, meta);
  }

  // --- Comments ---------------------------------------------------------------------------------

  @Patch('post-comments/:id')
  @ApiOkResponse({ type: PostDto })
  editComment(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CommentEditDto,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.editComment(principalOf(req), id, body, meta);
  }

  @Delete('post-comments/:id')
  @ApiOkResponse({ type: PostDto })
  deleteComment(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.deleteComment(principalOf(req), id, meta);
  }

  @Put('post-comments/:id/reactions/:reaction')
  @ApiOkResponse({ type: PostDto })
  reactComment(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reaction') reaction: string,
  ): Promise<PostDto> {
    return this.posts.react(principalOf(req), 'comment', id, reaction, true);
  }

  @Delete('post-comments/:id/reactions/:reaction')
  @ApiOkResponse({ type: PostDto })
  unreactComment(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reaction') reaction: string,
  ): Promise<PostDto> {
    return this.posts.react(principalOf(req), 'comment', id, reaction, false);
  }

  @Post('post-comments/:id/remove')
  @HttpCode(200)
  @ApiOkResponse({ type: PostDto })
  removeComment(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReasonDto,
    @Meta() meta: RequestMeta,
  ): Promise<PostDto> {
    return this.posts.removeComment(principalOf(req), id, body.reason, meta);
  }
}
