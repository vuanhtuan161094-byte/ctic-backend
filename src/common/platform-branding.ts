export interface PlatformBranding {
    certificationBodyShortName: string;
    certificationBodyName: string;
    certificationBodyWebsite: string;
    certificationBodyEmail: string;
    certificationBodyPhone: string;
    certificationBodyAddress: string;
    platformTitle: string;
    swaggerSiteTitle: string;
}

export interface PlatformBrandingProfile {
    short_name?: string | null;
    display_name?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    portal_title?: string | null;
}

function readEnv(
    name: string,
    fallback: string,
): string {
    return process.env[name]?.trim() || fallback;
}

export function getPlatformBranding(profile?: PlatformBrandingProfile | null): PlatformBranding {
    const certificationBodyShortName = profile?.short_name?.trim() || readEnv(
        'CERTIFICATION_BODY_SHORT_NAME',
        'CB',
    );

    const certificationBodyName = profile?.display_name?.trim() || readEnv(
        'CERTIFICATION_BODY_NAME',
        'TỔ CHỨC CHỨNG NHẬN / CERTIFICATION BODY',
    );

    return {
        certificationBodyShortName,
        certificationBodyName,
        certificationBodyWebsite: profile?.website?.trim() || readEnv(
            'CERTIFICATION_BODY_WEBSITE',
            '—',
        ),
        certificationBodyEmail: profile?.email?.trim() || readEnv(
            'CERTIFICATION_BODY_EMAIL',
            '—',
        ),
        certificationBodyPhone: profile?.phone?.trim() || readEnv(
            'CERTIFICATION_BODY_PHONE',
            '—',
        ),
        certificationBodyAddress: profile?.address?.trim() || readEnv(
            'CERTIFICATION_BODY_ADDRESS',
            '—',
        ),
        platformTitle: profile?.portal_title?.trim() || readEnv(
            'PLATFORM_TITLE',
            'Certification Management Platform',
        ),
        swaggerSiteTitle: readEnv(
            'SWAGGER_SITE_TITLE',
            `${certificationBodyShortName} CMP API`,
        ),
    };
}
