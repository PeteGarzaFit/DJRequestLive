# SI DJ Bridge Packaging

This workflow creates unsigned build artifacts only. Production code signing and notarization are intentionally not automated until the Apple Developer ID credentials are placed in GitHub Actions secrets.

## Production Mac signing

Required secret material should be stored as GitHub Actions secrets, never committed:
- APPLE_DEVELOPER_ID_CERT_P12
- APPLE_P12_PASSWORD
- APPLE_NOTARY_ISSUER_ID
- APPLE_NOTARY_KEY_ID
- APPLE_NOTARY_PRIVATE_KEY

The signing job will import the Developer ID Application identity into a temporary keychain, sign with Hardened Runtime, notarize with notarytool, staple the ticket, and produce the final DMG.

## Local developer build

The current Bridge is a Node service. For the first production milestone, package it with a desktop shell/launcher so DJs never need Node or Terminal.
