import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.SIDECAR_SECRET;
    // In dev mode (no secret set), allow all requests
    if (!secret) return true;
    const req = context.switchToHttp().getRequest();
    if (req.headers['x-sidecar-secret'] !== secret) {
      throw new ForbiddenException('Invalid sidecar secret');
    }
    return true;
  }
}
