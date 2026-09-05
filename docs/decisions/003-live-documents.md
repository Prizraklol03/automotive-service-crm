# Decision 003: live document records

## Status

Implemented.

## Decision

Document records remain live application entities rather than deletable historical files. Rendering is separated from template storage and PDF conversion.

## Portfolio consequence

Rendering and storage code is included, while private DOCX/PDF templates and generated customer documents are not. Deployments must provide independently reviewed templates.
