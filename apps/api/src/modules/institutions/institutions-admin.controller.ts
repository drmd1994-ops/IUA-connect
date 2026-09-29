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
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { Audited } from '../audit';
import { IdDto } from '../../common/dto/id.dto';
import {
  AdminHospitalListDto,
  AssignDirectorDto,
  CreateDepartmentDto,
  CreateHospitalDto,
  DirectorListDto,
  UpdateDepartmentDto,
  UpdateHospitalDto,
} from './institutions.dto';
import { InstitutionsService } from './institutions.service';

/**
 * Hospitals, departments and department directors (M2 plan §3.5). Admin permissions apply only
 * in a session that completed MFA (the roles require it).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/institutions')
@RequirePermission('institutions.manage')
export class InstitutionsAdminController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get('hospitals')
  @ApiOkResponse({ type: AdminHospitalListDto })
  async hospitals(): Promise<AdminHospitalListDto> {
    return { items: await this.institutions.adminHospitals() };
  }

  @Post('hospitals')
  @Audited({ action: 'institutions.hospital.create', entityType: 'hospital' })
  @ApiCreatedResponse({ type: IdDto })
  createHospital(@Body() body: CreateHospitalDto): Promise<IdDto> {
    return this.institutions.createHospital(body);
  }

  @Patch('hospitals/:id')
  @HttpCode(204)
  @Audited({ action: 'institutions.hospital.update', entityType: 'hospital' })
  @ApiNoContentResponse()
  updateHospital(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateHospitalDto,
  ): Promise<void> {
    return this.institutions.updateHospital(id, body);
  }

  @Post('hospitals/:id/departments')
  @Audited({ action: 'institutions.department.create', entityType: 'department', idParam: '' })
  @ApiCreatedResponse({ type: IdDto })
  createDepartment(
    @Param('id', new ParseUUIDPipe()) hospitalId: string,
    @Body() body: CreateDepartmentDto,
  ): Promise<IdDto> {
    return this.institutions.createDepartment(hospitalId, body);
  }

  @Patch('departments/:id')
  @HttpCode(204)
  @Audited({ action: 'institutions.department.update', entityType: 'department' })
  @ApiNoContentResponse()
  updateDepartment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDepartmentDto,
  ): Promise<void> {
    return this.institutions.updateDepartment(id, body);
  }

  @Get('departments/:id/directors')
  @ApiOkResponse({ type: DirectorListDto })
  async directors(@Param('id', new ParseUUIDPipe()) id: string): Promise<DirectorListDto> {
    return { items: await this.institutions.directors(id) };
  }

  /** Audited by the service (it records which account became director). */
  @Post('departments/:id/directors')
  @HttpCode(200)
  @ApiOkResponse({ type: DirectorListDto })
  async assignDirector(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AssignDirectorDto,
    @Meta() meta: RequestMeta,
  ): Promise<DirectorListDto> {
    const items = await this.institutions.assignDirector(
      id,
      body.email,
      principalOf(req).userId,
      meta,
    );
    return { items };
  }

  @Delete('departments/:id/directors/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeDirector(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.institutions.removeDirector(id, userId, principalOf(req).userId, meta);
  }
}
