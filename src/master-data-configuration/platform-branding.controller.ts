import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('platform-branding')
@UseGuards(JwtAuthGuard)
export class PlatformBrandingController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    async branding() {
        const profile = await this.prisma.organization_profiles.findUnique({
            where: { profile_key: 'PRIMARY' },
            select: { display_name: true, short_name: true, portal_title: true },
        });
        // Explicit output allowlist: never return internal profile/asset/retention data.
        return {
            display_name: profile?.display_name?.trim() || null,
            short_name: profile?.short_name?.trim() || null,
            portal_title: profile?.portal_title?.trim() || null,
        };
    }
}
