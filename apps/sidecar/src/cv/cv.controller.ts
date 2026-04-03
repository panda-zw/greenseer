import {
  Body, Controller, Delete, Get, Param, Post, Put,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CvService } from './cv.service';
import { FileParserService } from './file-parser.service';

@Controller('cv')
export class CvController {
  constructor(
    private readonly cvService: CvService,
    private readonly fileParser: FileParserService,
  ) {}

  @Get('profiles')
  listProfiles() {
    return this.cvService.listProfiles();
  }

  @Get('profiles/:id')
  getProfile(@Param('id') id: string) {
    return this.cvService.getProfile(id);
  }

  @Post('profiles')
  createProfile(@Body() body: { name: string; body: string }) {
    return this.cvService.createProfile(body.name, body.body);
  }

  @Post('profiles/upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/png',
        'image/jpeg',
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  }))
  async uploadProfile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string },
  ) {
    const text = await this.fileParser.parseFile(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const name = body.name || file.originalname.replace(/\.\w+$/, '') || 'Uploaded CV';
    return this.cvService.createProfile(name, text);
  }

  @Post('parse-file')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/png',
        'image/jpeg',
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  }))
  async parseFile(@UploadedFile() file: Express.Multer.File) {
    const text = await this.fileParser.parseFile(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    return { text, filename: file.originalname };
  }

  @Put('profiles/:id')
  updateProfile(
    @Param('id') id: string,
    @Body() data: { name?: string; body?: string },
  ) {
    return this.cvService.updateProfile(id, data);
  }

  @Delete('profiles/:id')
  deleteProfile(@Param('id') id: string) {
    return this.cvService.deleteProfile(id);
  }

  @Post('profiles/:id/default')
  setDefault(@Param('id') id: string) {
    return this.cvService.setDefault(id);
  }

  @Put('profiles/:id/skills')
  updateSkills(
    @Param('id') id: string,
    @Body() body: { skills: string[] },
  ) {
    return this.cvService.updateSkills(id, body.skills);
  }

  @Get('profiles/:id/versions')
  getVersions(@Param('id') id: string) {
    return this.cvService.getVersions(id);
  }

  @Post('profiles/:id/versions/:index/restore')
  restoreVersion(
    @Param('id') id: string,
    @Param('index') index: string,
  ) {
    return this.cvService.restoreVersion(id, parseInt(index, 10));
  }
}
