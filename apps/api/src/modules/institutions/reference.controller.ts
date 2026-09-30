import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/access.decorators';
import {
  DepartmentListDto,
  HospitalListDto,
  MembershipTypeListDto,
  SubspecialtyListDto,
} from './institutions.dto';
import { InstitutionsService } from './institutions.service';

/** Changes rarely and holds no personal data, so browsers and proxies may cache it briefly. */
const CACHE_PUBLIC = 'public, max-age=300';

/** Reference lists for forms (API_DESIGN.md §4: public, cached). */
@ApiTags('reference')
@Controller()
@Public()
export class ReferenceController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get('hospitals')
  @Header('Cache-Control', CACHE_PUBLIC)
  @ApiOkResponse({ type: HospitalListDto })
  async hospitals(): Promise<HospitalListDto> {
    return { items: await this.institutions.hospitals() };
  }

  @Get('hospitals/:id/departments')
  @Header('Cache-Control', CACHE_PUBLIC)
  @ApiOkResponse({ type: DepartmentListDto })
  async departments(@Param('id', new ParseUUIDPipe()) id: string): Promise<DepartmentListDto> {
    return { items: await this.institutions.departments(id) };
  }

  @Get('subspecialties')
  @Header('Cache-Control', CACHE_PUBLIC)
  @ApiOkResponse({ type: SubspecialtyListDto })
  async subspecialties(): Promise<SubspecialtyListDto> {
    return { items: await this.institutions.subspecialties() };
  }

  @Get('membership-types')
  @Header('Cache-Control', CACHE_PUBLIC)
  @ApiOkResponse({ type: MembershipTypeListDto })
  async membershipTypes(): Promise<MembershipTypeListDto> {
    return { items: await this.institutions.membershipTypes() };
  }
}
