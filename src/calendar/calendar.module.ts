import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CalendarController } from './calendar.controller.js';
import { GoogleCalendarService } from './google-calendar.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class CalendarModule {}
