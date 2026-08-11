import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUserPayload {
  sub: string;
  email: string;
  name: string;
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtUserPayload | undefined;
    if (!user) return null;
    return data ? user[data] : user;
  },
);
