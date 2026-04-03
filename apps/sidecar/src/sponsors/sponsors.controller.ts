import {
  Body, Controller, Delete, Get, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SponsorsService } from './sponsors.service';

@Controller('sponsors')
export class SponsorsController {
  constructor(private readonly sponsors: SponsorsService) {}

  @Get()
  getSponsors(
    @Query('countryCode') countryCode?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sponsors.getSponsors({
      countryCode,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats')
  getStats() {
    return this.sponsors.getStats();
  }

  @Post()
  addSponsor(@Body() body: { company: string; countryCode: string }) {
    return this.sponsors.addSponsor(body.company, body.countryCode, 'manual');
  }

  @Delete()
  removeSponsor(@Body() body: { company: string; countryCode: string }) {
    return this.sponsors.removeSponsor(body.company, body.countryCode);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'));
    },
  }))
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { countryCode: string },
  ) {
    const content = file.buffer.toString('utf-8');
    const count = await this.sponsors.importCsv(content, body.countryCode, 'csv-import');
    return { imported: count };
  }

  @Post('fetch-register')
  async fetchRegister(@Query('countryCode') countryCode: string) {
    const count = await this.sponsors.fetchOfficialRegister(countryCode);
    return { imported: count };
  }
}
