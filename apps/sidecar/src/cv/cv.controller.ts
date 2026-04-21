import {
  BadRequestException,
  Body, Controller, Delete, Get, Param, Post, Put,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CvService } from './cv.service';
import { FileParserService } from './file-parser.service';
import type { StructuredCV } from '@greenseer/shared';

const UPLOAD_LIMITS = { fileSize: 10 * 1024 * 1024 };
// Use extension whitelist — mimetypes vary across OSes (e.g. Safari sends
// `application/x-pdf` or empty string for some PDFs). Validating by extension
// in the filter lets us return a clean 400 from the controller with a useful
// message rather than silently dropping the file.
const ALLOWED_EXTS = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp'];
function extFilter(_req: any, file: Express.Multer.File, cb: (err: Error | null, acceptFile: boolean) => void) {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  cb(null, ALLOWED_EXTS.includes(ext));
}

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
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS, fileFilter: extFilter }))
  async uploadProfile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string },
  ) {
    if (!file) {
      throw new BadRequestException(
        `No file received. Supported formats: ${ALLOWED_EXTS.join(', ')}. Max 10 MB.`,
      );
    }
    const text = await this.fileParser.parseFile(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const name = body.name || file.originalname.replace(/\.\w+$/, '') || 'Uploaded CV';
    return this.cvService.createProfile(name, text);
  }

  @Post('parse-file')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS, fileFilter: extFilter }))
  async parseFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        `No file received. Supported formats: ${ALLOWED_EXTS.join(', ')}. Max 10 MB.`,
      );
    }
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
    @Body() data: { name?: string; body?: string; structured?: StructuredCV | null },
  ) {
    return this.cvService.updateProfile(id, data);
  }

  @Post('profiles/:id/parse-structured')
  parseStructured(@Param('id') id: string) {
    return this.cvService.parseStructured(id);
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
