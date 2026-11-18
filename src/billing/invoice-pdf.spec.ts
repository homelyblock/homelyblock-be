import { describe, expect, it } from 'vitest';
import { buildInvoicePdf } from './invoice-pdf.js';
import type { BillDto, PaymentDto } from './billing.mapper.js';

describe('buildInvoicePdf', () => {
  it('renders a PDF buffer with invoice totals from server data', async () => {
    const bill: BillDto = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      societyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      buildingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      unitId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      configId: null,
      billedUserId: null,
      invoiceNumber: 'INV-202611-101-0001',
      periodYear: 2026,
      periodMonth: 11,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      invoiceDate: '2026-11-01',
      dueDate: '2026-11-10',
      baseAmount: '1500.00',
      additionalAmount: '100.00',
      discountAmount: '0.00',
      totalAmount: '1600.00',
      paidAmount: '600.00',
      outstandingAmount: '1000.00',
      status: 'PARTIALLY_PAID',
      unitNumber: '101',
      buildingCode: 'A',
      lineItems: [
        {
          id: '1',
          description: 'Monthly maintenance',
          amount: '1500.00',
          lineType: 'BASE',
        },
        {
          id: '2',
          description: 'Sinking fund',
          amount: '100.00',
          lineType: 'ADDITIONAL',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const payments: PaymentDto[] = [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        societyId: bill.societyId,
        billId: bill.id,
        amount: '600.00',
        method: 'UPI',
        paidAt: '2026-11-05T10:00:00.000Z',
        referenceNumber: 'UPI-1',
        notes: null,
        status: 'RECORDED',
        idempotencyKey: 'key-1',
        recordedByUserId: '11111111-1111-4111-8111-111111111111',
        reversedAt: null,
        reversedByUserId: null,
        reversalReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const buffer = await buildInvoicePdf({
      society: {
        name: 'Green Heights Society',
        addressLine1: '12 Park Road',
        addressLine2: null,
        city: 'Pune',
        state: 'MH',
        postalCode: '411001',
      },
      bill,
      payments,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(500);
  });
});
