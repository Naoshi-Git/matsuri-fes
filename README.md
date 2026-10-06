# Matsuri FES Projects

This repository hosts independent public projects under GitHub Pages.

## Structure

- `/sites/{project}/{subject}/` contains one site's pages and page wrappers.
- `/_includes/sites/{project}/{subject}/` holds publication source text that is rendered into those pages.
- `/assets/` and `/assets/css/` contain shared public assets and styling.
- `/_layouts/` contains the shared project and publication shells.

A new publication can be added as a sibling under `sites/`; it does not need to replace the root project index.

## Sailing career books

The career-book route is a password-gated PDF viewer. The combined PDF in `assets/sailing-career-book.pdf` is generated from the private authoring repository's HTML reader and displayed inside the site page; there is no download link in the page UI. The Markdown copies in `_includes/sites/sailing/career/` remain as source snapshots for reference, but the public route presents the PDF edition.

To update an edition, replace its matching Markdown file in `_includes/sites/sailing/career/` with the corresponding distribution file from the authoring repository. Review the diff, then commit. The original source remains authoritative; this public copy is only the publishing mirror. Do not copy internal orientation or operational material into this public repository.

## GitHub Pages

This site uses GitHub Pages' built-in Jekyll support. Select the `main` branch and repository root as the Pages source in repository Settings → Pages.
