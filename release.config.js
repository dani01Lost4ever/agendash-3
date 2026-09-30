module.exports = {
    branches: ['master'],
    // Releases are tagged without a "v" (3.0.6 was tagged by hand that way).
    // The v1.x tags come from the upstream project and sort below it.
    tagFormat: '${version}',
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        [
            '@semantic-release/changelog',
            {
                changelogFile: 'CHANGELOG.md',
            },
        ],
        // Publishes with npm trusted publishing (OIDC) when run from
        // .github/workflows/release.yml; npm adds provenance on its own.
        '@semantic-release/npm',
        [
            '@semantic-release/git',
            {
                assets: ['package.json', 'CHANGELOG.md', 'package-lock.json'],
                message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
        // Last, so a GitHub release only appears once the package is on npm.
        '@semantic-release/github',
    ],
};
