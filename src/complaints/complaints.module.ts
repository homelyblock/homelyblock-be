import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { ComplaintsController } from './complaints.controller.js';
import { ComplaintsService } from './complaints.service.js';
import {
  COMPLAINT_ATTACHMENT_STORAGE,
  type ComplaintAttachmentStorage,
} from './storage/complaint-attachment-storage.js';
import { DisabledComplaintAttachmentStorage } from './storage/disabled-complaint-attachment-storage.js';
import { LocalComplaintAttachmentStorage } from './storage/local-complaint-attachment-storage.js';
import { MemoryComplaintAttachmentStorage } from './storage/memory-complaint-attachment-storage.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ComplaintsController],
  providers: [
    ComplaintsService,
    {
      provide: COMPLAINT_ATTACHMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ComplaintAttachmentStorage => {
        const mode = (
          config.get<string>('COMPLAINT_ATTACHMENT_STORAGE') ?? 'disabled'
        )
          .trim()
          .toLowerCase();
        if (mode === 'memory') {
          return new MemoryComplaintAttachmentStorage();
        }
        if (mode === 'local') {
          const dir =
            config.get<string>('COMPLAINT_ATTACHMENT_DIR') ??
            './storage/complaint-attachments';
          return new LocalComplaintAttachmentStorage(dir);
        }
        return new DisabledComplaintAttachmentStorage();
      },
    },
  ],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
