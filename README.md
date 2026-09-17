# Obaidul Mentor Lab

A static, GitHub Pages-friendly premium support portal for HTML + CSS students.

## What it does

- Upload classes into `Classes/` as folders or ZIP files.
- Upload mentor articles into `Blogs/` as folders or ZIP files.
- `metadata.json` is the preferred content schema. `README.md` / `article.md` is used as a fallback for title and description when metadata is missing.
- GitHub Actions detects content, generates the catalog, packages each item as ZIP, encrypts every package, generates a sitemap, and deploys `dist/` to GitHub Pages.
- Students unlock the library in-browser with a password. The password is never sent to a server.
- Monaco Editor provides a VS Code-style coding experience with HTML/CSS/JSON IntelliSense and validation. A textarea editor is used automatically if Monaco cannot load.
- Student edits and homework progress are saved locally in the browser. No account/database is required.
- Students can download the original provided ZIP or their edited ZIP.
- Live preview runs inside a sandboxed iframe. Local image assets are converted to data URLs for previewing.
- A service worker adds a cache layer for the static shell and already-fetched encrypted catalog/packages.

## Content schema

### `Classes/<class-folder>/metadata.json`

```json
{
  "id": "html-forms",
  "title": "HTML Forms: Structure, Labels & Inputs",
  "description": "Build a clean semantic HTML form.",
  "summary": "Optional short summary.",
  "level": "Beginner",
  "duration": "45–60 min",
  "tags": ["HTML", "Forms"],
  "order": 1,
  "featured": true,
  "homework": {
    "hints": ["Hint 1", "Hint 2"],
    "tasks": [
      {
        "title": "Add the form",
        "description": "Create the main form.",
        "checks": [
          {"type": "contains", "file": "index.html", "value": "<form"}
        ]
      }
    ]
  }
}
```

Supported homework checks include `contains`, `not_contains`, `regex`, `min_length`, `html_elements`, `css_property`, `files_exist`, and nested `all` / `any` groups.

### Blogs

Use the same metadata fields where useful. Put the article in `article.md`. `README.md` also works.

## GitHub setup

1. Put this project in your repository.
2. Put classes in `Classes/` and blog folders in `Blogs/`.
3. In **Settings → Secrets and variables → Actions → New repository secret**, create:

`CLASS_ACCESS_PASSWORD`

Use a strong password. The workflow uses it only during the build to encrypt the catalog and packages. GitHub Actions secrets are encrypted in GitHub and are only exposed to a workflow when the workflow references them.

4. Optional: create an Actions variable named `SITE_URL` with your Pages URL. If omitted, the build uses a placeholder URL in the generated sitemap.
5. In **Settings → Pages**, set the publishing source to **GitHub Actions**. The workflow uses GitHub's Pages deployment actions to build and publish the generated `dist/` directory.
6. Push to `main`. The workflow builds and deploys automatically.

## Security reality you should know

The published website does not expose the plaintext class files. It only publishes encrypted catalog/package blobs. However, if this repository is public, the original files inside the Git repository are still public. GitHub Pages is static hosting and does not provide a server-side password wall. Repository visibility and Pages availability also depend on your GitHub plan.

For **true confidentiality of the source material**, keep the content repository private and have the build workflow read that private repository using a narrowly scoped credential (or use a plan/setup that supports a private Pages source). Do not put the raw class repository in public Git history and assume the browser password hides it.

## Local testing

Run:

```bash
CLASS_ACCESS_PASSWORD=demo-only-change-me node scripts/build.mjs
python -m http.server 4173 -d dist
```

Open `http://localhost:4173` and use `demo-only-change-me`. Never use that password for real students.

## Design principles

Minimal interface, subtle infinite-loop motion, restrained mentor branding, keyboard-friendly controls, responsive layout, progressive enhancement, local-first persistence and graceful fallbacks.

## Troubleshooting

If a workflow fails at `Validate generated site`, open the failed step and read the first `Error:` line. The build is designed to fail closed rather than deploy a partial site.

Common requirements:
- `CLASS_ACCESS_PASSWORD` must exist as a repository Actions secret for production builds.
- Pages source must remain **GitHub Actions**.
- Pushes must land on `main` or `master`, or use **Run workflow** from the Actions tab.
- For a project Pages site, `SITE_URL` is optional but recommended for correct sitemap URLs.
