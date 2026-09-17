# Security model

## Threat model

This project treats the student password as an access key for the published encrypted teaching resources. It is not a substitute for server-side authentication.

### Protected

- Plaintext class/blog resources are encrypted before being published to `dist/data/`.
- The browser decrypts packages locally after password entry using Web Crypto AES-256-GCM and PBKDF2-SHA-256.
- Integrity is authenticated with AES-GCM additional authenticated data.
- Student source edits stay in browser local storage. They are not uploaded by this site.
- The live preview is sandboxed without script execution enabled.

### Not protected

- Anything committed to a public Git repository is public, including raw files inside `Classes/` and `Blogs/`.
- The shared password can be given to students, so it should be treated as a teaching-access secret, not an individual account credential.
- Browser-side protection cannot stop a student who already knows the password from copying the decrypted source.

## Recommended production setup

For private course source code, keep the content repository private. The public Pages repository should contain only the site shell/workflow and encrypted build output. Use a minimal read-only credential in GitHub Actions to fetch the private content repository.
