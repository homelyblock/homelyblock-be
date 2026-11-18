import type {
  ServiceCategory,
  ServiceProvider,
} from '../generated/prisma/client.js';

export type ServiceProviderDto = {
  id: string;
  societyId: string;
  name: string;
  category: ServiceCategory;
  description: string | null;
  contactPerson: string | null;
  phone: string;
  whatsappNumber: string | null;
  address: string | null;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export function toServiceProviderDto(
  provider: ServiceProvider,
): ServiceProviderDto {
  return {
    id: provider.id,
    societyId: provider.societyId,
    name: provider.name,
    category: provider.category,
    description: provider.description,
    contactPerson: provider.contactPerson,
    phone: provider.phone,
    whatsappNumber: provider.whatsappNumber,
    address: provider.address,
    isActive: provider.isActive,
    createdByUserId: provider.createdByUserId,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}
