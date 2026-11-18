import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationGuard } from '../authorization/authorization.guard.js';
import { BillingService } from './billing.service.js';
import { CreateMaintenanceConfigDto } from './dto/create-maintenance-config.dto.js';
import { GenerateBillsDto } from './dto/generate-bills.dto.js';
import { ListBillsQueryDto } from './dto/list-bills-query.dto.js';
import { PublishPeriodDto } from './dto/publish-period.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { ReversePaymentDto } from './dto/reverse-payment.dto.js';
import { UpdateMaintenanceConfigDto } from './dto/update-maintenance-config.dto.js';

@ApiTags('billing')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, AuthorizationGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('societies/:societyId/maintenance-configs')
  @ApiOperation({ summary: 'List maintenance configurations' })
  async listConfigs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
  ) {
    const items = await this.billingService.listConfigs(user, societyId);
    return { data: { items } };
  }

  @Post('societies/:societyId/maintenance-configs')
  @ApiCreatedResponse({ description: 'Configuration created' })
  async createConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: CreateMaintenanceConfigDto,
  ) {
    const config = await this.billingService.createConfig(user, societyId, body);
    return { data: config };
  }

  @Patch('maintenance-configs/:configId')
  @ApiOkResponse({ description: 'Configuration updated' })
  async updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Body() body: UpdateMaintenanceConfigDto,
  ) {
    const config = await this.billingService.updateConfig(user, configId, body);
    return { data: config };
  }

  @Post('societies/:societyId/maintenance-bills/preview')
  @ApiOperation({ summary: 'Preview bill generation without writing' })
  async previewBills(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: GenerateBillsDto,
  ) {
    const data = await this.billingService.previewBills(user, societyId, body);
    return { data };
  }

  @Post('societies/:societyId/maintenance-bills/generate')
  @ApiCreatedResponse({ description: 'Draft bills generated' })
  async generateBills(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: GenerateBillsDto,
  ) {
    const data = await this.billingService.generateBills(user, societyId, body);
    return { data };
  }

  @Post('societies/:societyId/maintenance-bills/publish-period')
  @ApiOperation({ summary: 'Publish all draft bills for a period' })
  async publishPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() body: PublishPeriodDto,
  ) {
    const data = await this.billingService.publishPeriod(
      user,
      societyId,
      body.periodYear,
      body.periodMonth,
    );
    return { data };
  }

  @Get('societies/:societyId/maintenance-bills')
  @ApiOperation({ summary: 'List maintenance bills (role-scoped)' })
  async listBills(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query() query: ListBillsQueryDto,
  ) {
    const data = await this.billingService.listBills(user, societyId, query);
    return { data };
  }

  @Get('societies/:societyId/billing-dashboard')
  @ApiOperation({ summary: 'Admin billing dashboard aggregates' })
  async dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Query('periodYear') periodYear?: string,
    @Query('periodMonth') periodMonth?: string,
    @Query('buildingId') buildingId?: string,
  ) {
    const data = await this.billingService.getDashboard(user, societyId, {
      periodYear: periodYear ? Number(periodYear) : undefined,
      periodMonth: periodMonth ? Number(periodMonth) : undefined,
      buildingId,
    });
    return { data };
  }

  @Get('maintenance-bills/:billId')
  async getBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId', ParseUUIDPipe) billId: string,
  ) {
    const bill = await this.billingService.getBill(user, billId);
    return { data: bill };
  }

  @Get('maintenance-bills/:billId/pdf')
  @ApiOperation({ summary: 'Download invoice PDF (authorized viewers only)' })
  @ApiProduces('application/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadInvoicePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId', ParseUUIDPipe) billId: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.billingService.getInvoicePdf(
      user,
      billId,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('maintenance-bills/:billId/publish')
  async publishBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId', ParseUUIDPipe) billId: string,
  ) {
    const bill = await this.billingService.publishBill(user, billId);
    return { data: bill };
  }

  @Post('maintenance-bills/:billId/cancel')
  async cancelBill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId', ParseUUIDPipe) billId: string,
  ) {
    const bill = await this.billingService.cancelBill(user, billId);
    return { data: bill };
  }

  @Post('maintenance-bills/:billId/payments')
  @ApiCreatedResponse({ description: 'Payment recorded' })
  async recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId', ParseUUIDPipe) billId: string,
    @Body() body: RecordPaymentDto,
  ) {
    const data = await this.billingService.recordPayment(user, billId, body);
    return { data };
  }

  @Get('maintenance-bills/:billId/payments')
  async listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('billId', ParseUUIDPipe) billId: string,
  ) {
    const items = await this.billingService.listPaymentsForBill(user, billId);
    return { data: { items } };
  }

  @Post('maintenance-payments/:paymentId/reverse')
  async reversePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() body: ReversePaymentDto,
  ) {
    const data = await this.billingService.reversePayment(
      user,
      paymentId,
      body,
    );
    return { data };
  }
}
