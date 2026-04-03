import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { TrackerService } from './tracker.service';
import type { ApplicationStatus } from '@greenseer/shared';

@Controller('tracker')
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  @Get('applications')
  getApplications(@Query('status') status?: string) {
    return this.tracker.getApplications(status);
  }

  @Get('applications/:id')
  getApplication(@Param('id') id: string) {
    return this.tracker.getApplication(id);
  }

  @Post('applications')
  createApplication(
    @Body() body: { jobId: string; status?: ApplicationStatus },
  ) {
    return this.tracker.createFromJob(body.jobId, body.status);
  }

  @Put('applications/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: ApplicationStatus; note?: string },
  ) {
    return this.tracker.updateStatus(id, body.status, body.note);
  }

  @Put('applications/:id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body() body: { notes: string },
  ) {
    return this.tracker.updateNotes(id, body.notes);
  }

  @Put('applications/:id/salary')
  updateSalary(
    @Param('id') id: string,
    @Body() body: { salaryOffer: string },
  ) {
    return this.tracker.updateSalary(id, body.salaryOffer);
  }

  @Get('statistics')
  getStatistics() {
    return this.tracker.getStatistics();
  }
}
