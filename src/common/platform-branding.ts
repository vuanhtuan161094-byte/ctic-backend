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

function readEnv(
    name: string,
    fallback: string,
): string {
    return process.env[name]?.trim() || fallback;
}

export function getPlatformBranding(): PlatformBranding {
    const certificationBodyShortName = readEnv(
        'CERTIFICATION_BODY_SHORT_NAME',
        'CB',
    );

    const certificationBodyName = readEnv(
        'CERTIFICATION_BODY_NAME',
        'TỔ CHỨC CHỨNG NHẬN / CERTIFICATION BODY',
    );

    return {
        certificationBodyShortName,
        certificationBodyName,
        certificationBodyWebsite: readEnv(
            'CERTIFICATION_BODY_WEBSITE',
            '—',
        ),
        certificationBodyEmail: readEnv(
            'CERTIFICATION_BODY_EMAIL',
            '—',
        ),
        certificationBodyPhone: readEnv(
            'CERTIFICATION_BODY_PHONE',
            '—',
        ),
        certificationBodyAddress: readEnv(
            'CERTIFICATION_BODY_ADDRESS',
            '—',
        ),
        platformTitle: readEnv(
            'PLATFORM_TITLE',
            'Certification Management Platform',
        ),
        swaggerSiteTitle: readEnv(
            'SWAGGER_SITE_TITLE',
            `${certificationBodyShortName} CMP API`,
        ),
    };
}
