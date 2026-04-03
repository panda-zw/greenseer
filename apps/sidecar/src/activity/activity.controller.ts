import { Controller, Delete, Get, Query } from '@nestjs/common';
import { ActivityService, type ActivityLevel } from './activity.service';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  getEntries(
    @Query('limit') limit?: string,
    @Query('level') level?: string,
  ) {
    return this.activity.getEntries(
      limit ? parseInt(limit, 10) : 50,
      level as ActivityLevel | undefined,
    );
  }

  @Delete()
  clear() {
    this.activity.clear();
    return { ok: true };
  }
}
