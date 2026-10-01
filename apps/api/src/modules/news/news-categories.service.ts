import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { AppException } from '../../common/errors/app.exception';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  type CreateNewsCategoryDto,
  type NewsCategoryDto,
  type UpdateNewsCategoryDto,
} from './news.dto';

const SELECT = {
  id: true,
  key: true,
  nameHe: true,
  nameEn: true,
  sortOrder: true,
  active: true,
} as const;

/** News categories (admin-editable, Hebrew and English names). Deactivated, never deleted. */
@Injectable()
export class NewsCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(activeOnly: boolean): Promise<NewsCategoryDto[]> {
    return this.prisma.newsCategory.findMany({
      where: activeOnly ? { active: true } : {},
      select: SELECT,
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
  }

  async create(input: CreateNewsCategoryDto): Promise<NewsCategoryDto> {
    try {
      return await this.prisma.newsCategory.create({
        data: { id: uuidv7(), ...input },
        select: SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'key', code: 'categoryKeyTaken' }]);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateNewsCategoryDto): Promise<NewsCategoryDto> {
    const found = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!found) throw new AppException('NOT_FOUND');
    return this.prisma.newsCategory.update({ where: { id }, data: input, select: SELECT });
  }
}
