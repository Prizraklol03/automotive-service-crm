# Document templates are not distributed

The application supports DOCX mapping/rendering and PDF conversion, but the private commercial templates were deliberately excluded. They may contain business identity, author metadata, custom properties, and other non-source artifacts.

For local experimentation, create new generic templates from a blank document and review the package metadata and relationships before use. Keep `.docx`/`.pdf` files untracked. Backend rendering tests create their own temporary synthetic documents where needed.
