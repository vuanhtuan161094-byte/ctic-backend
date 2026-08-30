export interface ReleaseMetadata {
    version: string;
    build_identifier: string | null;
    release_channel: string | null;
}

export function getReleaseMetadata(
    env: Record<string, string | undefined> = process.env,
): ReleaseMetadata {
    return {
        version:
            env.APP_VERSION?.trim() ||
            env.npm_package_version?.trim() ||
            '0.0.1',

        build_identifier:
            env.APP_BUILD_ID?.trim() ||
            null,

        release_channel:
            env.APP_RELEASE_CHANNEL?.trim() ||
            null,
    };
}
